# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.8.1] - 2026-09-07

### Fixed

- Scrape workflow could never start: the Telegram alert step referenced
  `secrets.*` inside its `if:` condition, which GitHub Actions rejects at
  parse time (`Unrecognized named-value: 'secrets'`). Every trigger
  (push, manual run, schedule, `repository_dispatch`) ended in a
  `startup_failure` before any step executed. The alert is now gated by
  `if: failure()` with the secret check moved into the step shell.
- Scrape and RSS-watch workflows ran on Node.js 20 despite the project's
  `>=22` requirement; both now use Node.js 22.

### Added

- `actionlint` job in CI to validate workflow files on every push, so
  invalid workflow syntax fails fast in CI instead of surfacing as a
  silent `startup_failure` on GitHub's side.

## [1.8.0] - 2026-09-07

### Added

- Alert quarantine: jobs whose alerts fail 3 times are quarantined with a
  loud warning instead of failing every run forever (fixes the poison-job
  availability hole; delete state to force a retry).
- Scalable Bloom filter (geometric layers, tightening fp, backward
  compatible snapshots), batched archive writes (`recordMany`) and
  retention (`--prune <days>`).
- `docs/SECURITY.md`: threat model + output-encoding boundary table;
  `test/hardening.test.js` security regression suite.

### Fixed

- CSV formula injection: cells starting with `= + - @` are neutralized.
- Telegram href attribute injection (`"` now escaped) and lone-surrogate
  truncation; non-`http(s)` link targets refused (Telegram + Discord).
- RSS control characters that produced unparseable feeds; ICS invalid-date
  throw; watcher title fallback; scaffold domain-length cap (ReDoS bound).
- Scrape workflow uploads its data artifact even on failure.

### Changed

- **Breaking:** requires Node.js 22+ (engines `>=22`, CI on 22/24).
  Node 18 and 20 are end-of-life, and cheerio 1.2's undici dependency
  reads the global `File` (Node 20+) at load time, so Node 18 can no
  longer run the parsers.

## [1.7.0] - 2026-09-07

### Added

- SQLite notification archive (`sql.js`, pure WASM, Node 18+):
  `job-digest.js --db <file>` records every successfully sent alert and
  backstops state loss — already-notified jobs are skipped even if the
  state file is gone (`--all` still rebroadcasts; dry runs and failed
  transports record nothing).
- Bloom pre-filter (`utils/bloom.js`, SHA-256 double hashing): instant
  in-memory "already notified?" checks with no false negatives, positives
  confirmed against the exact table, filter itself persisted inside the
  same single-file database.
- `tools/notify-db.js` (`npm run notify-db`): `--stats`, `--check`,
  `--recent`, `--export` queries over the archive.
- `docs/STORAGE.md` (how every artifact is stored), `.devcontainer/`
  one-click Codespaces setup, `*.db` gitignored — the database lives only
  in the workspace, with JSON export as the backup path.

## [1.6.0] - 2026-09-07

### Added

- GitHub Actions automation (`docs/AUTOMATION.md`): a daily `Scrape`
  workflow (jobs + papers lists + digest outputs committed to `data/`,
  manual inputs, artifact upload, Telegram failure alerts) and an
  every-30-minutes `RSS watch` news layer that triggers scraping when
  watched feeds (`feeds.txt`) gain new items.
- `tools/rss-watch.js`: fail-soft feed poller with seen-item state and
  `$GITHUB_OUTPUT` exports (`new-items`, `count`); covered by local-server
  tests.
- External trigger interface: `repository_dispatch` (`rss-new-items`) so
  any outside watcher can start a scrape; triggering run recorded in
  `data/lastrun.json`.
- Schedule reliability by design: every run commits run metadata, which
  counts as the repository activity GitHub requires to keep scheduled
  workflows enabled past 60 days.

## [1.5.0] - 2026-09-07

### Added

- RSS/Atom input for `job-digest.js`: `--rss-input <feed-url,...>` digests
  any job-portal feed (RSS 2.0, Atom, RDF) through the same diff/enrich/
  alert pipeline as scraped jobs — `-i` is now optional, both inputs merge
  with URL dedupe, dead feeds warn and skip without failing the run.
- `utils/feed.js`: namespace-proof feed parser (HTML-stripped summaries,
  categories, Atom `rel` link handling) plus link-less-item skipping.
- README Installation section (clone-and-run, global install, command
  list) and License section; `package.json` author set to Bihar24.
- GitHub Contents API publishing documented in the integrations backlog
  (free hosted RSS via GitHub Pages; needs `GITHUB_TOKEN`).

## [1.4.0] - 2026-09-07

### Added

- Previous-year question papers: new `scrap-paper-list.js` /
  `scrap-paper-detail.js` CLIs (`sarkari-paper-list` /
  `sarkari-paper-detail` bins) with UPSC official (`upsc.gov.in`, PDFs
  grouped by exam) and Adda247 (`adda247.com`, exam hubs + shift-wise
  English/Hindi PDF tables) beta sources.
- Three beta job sources: `freejobalert.com` (`/articles/` extraction),
  `employmentnews.gov.in` (official weekly journal) and `rojgarresult.com`.
- Source registry (`utils/sources.js`, single source of truth) with
  stable/beta statuses, `--list-sources` on all four CLIs, and a stderr
  beta warning on every beta scrape.
- Shared content-driven engines for beta/community parsers:
  `utils/harvest.js` (link/PDF/heading-group harvesting) and
  `utils/article.js` (generic article reader) — no fragile selectors.
- Contributor scaffold: `npm run new-source` (`tools/new-source.js`),
  `CONTRIBUTING.md` (incl. the beta live-validation checklist) and
  `docs/SOURCES.md` (status catalog + wanted list: Testbook, Prepp,
  JagranJosh, ssc.gov.in).
- `job-digest.js` titles now cover papers/article records (exam headings
  and Title/Exam records, not just Name of Post / Header).

## [1.3.0] - 2026-09-07

### Added

- New `job-digest.js` CLI (`sarkari-digest` bin): turns run-scrapper JSON
  into an enriched alert digest with new-job diffing via a state file
  (first run initialises, alerts start after — `--all` to broadcast).
- Fail-soft, cached enrichments powered by free keyless public APIs:
  AI summaries (Pollinations, `--summarize`), title translation
  (MyMemory, `--translate`, e.g. Hindi), pincode → district/state
  (api.postalpincode.in, `--locate`), holiday-aware deadlines
  (Nager.Date, `--holidays`), Wayback snapshots (`--archive`), short
  links (CleanURI, `--shorten`) and one-click publishing
  (Catbox, `--upload`).
- Alert transports: Telegram, Discord and generic JSON webhooks
  (Slack-compatible), with `--dry-run` previews and per-transport
  failure rollback so failed alerts retry next run.
- `--rss` feeds, `--ics` deadline calendars and Google Calendar
  "Remind me" links, with weekend/holiday "apply early" warnings.
- `docs/INTEGRATIONS.md`: the full magic menu with setup guides and
  credits to public-apis.

## [1.2.0] - 2026-09-07

### Added

- Automatic retries with exponential backoff, jitter and `Retry-After`
  support (`--retries`, `--retry-delay-ms`).
- Built-in `robots.txt` respect with per-origin caching and fail-open
  behaviour (`--ignore-robots` to opt out).
- Bounded-concurrency detail scraping (`--concurrency`, capped at 10,
  default sequential).
- Proxy support via `--proxy` or `HTTPS_PROXY`/`HTTP_PROXY` env vars, with
  `NO_PROXY` bypass.
- Same-site enforcement for followed pagination/detail links
  (`--allow-external` to opt out) plus off-site redirect warnings.
- Output-shape validation that warns on unexpected record structures
  (site-markup drift detection).
- Levelled stderr logging (`--quiet`, `--verbose`, `LOG_LEVEL`).
- `bin` entries (`sarkari-job-list`, `sarkari-job-detail`, `sarkari-scrape`).
- Engineering discipline: ESLint, Prettier, husky + lint-staged pre-commit
  hook, GitHub Actions CI matrix (Node 18/20/22), Dependabot, coverage
  script, changelog.

### Changed

- `run-scrapper.js` detail phase runs through a worker pool (order
  preserved, per-item failures captured).
- CLI flag handling unified in `utils/runtime.js`.

## [1.1.0] - 2026-09-06

### Fixed

- `run-scrapper.js` now follows pagination, passes the page URL to detail
  parsers, and writes one valid JSON/CSV file (previously concatenated
  fragments and dead `next` handling).
- `mergeKeyValue` no longer drops the last record; merges keep the label's
  key with the content's value/type.
- Declared the implicit-global loop variable in `sarkariexam.com/job-detail.js`.
- `scrap-job-detail.js` validates `-u` with the `URL` parser instead of
  string splitting (no more crashes on malformed input).

### Added

- Test suite (`node:test`, fixture HTML + local-server integration, no live
  network needed).
- Shared crawler with pagination loop detection and page caps.
- Stdout/stderr separation, exit codes (0/1/2), `--help`, `--max-pages`,
  `--max-jobs`, `--delay-ms`, `--timeout-ms` flags.
- Relative-URL resolution, request timeouts, polite User-Agent and delays.
- CSV hardening: rowspan/colspan fix, `Paragraph` support, null-safe and
  non-mutating formatters, empty-input handling.
- Correctly-spelled `scrape*` export aliases (old names kept).

### Security

- Upgraded `axios`, `cheerio`, `json2csv`, `table`: `npm audit` went from
  8 vulnerabilities (7 high) to 0.

## [1.0.0] - 2020-02-25

- Initial release.
