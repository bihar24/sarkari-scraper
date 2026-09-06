# Security

Threat model: **scraped content is untrusted input.** Job titles, links,
descriptions and feed items come from third-party sites (or compromised
ones) and flow into structured outputs — feeds, calendars, chat messages,
spreadsheets, SQL. Every boundary below is escaped, and every rule has a
regression test in `test/hardening.test.js`.

## Output-encoding boundaries

| Sink              | Rule                                                              | Code                 |
| ----------------- | ----------------------------------------------------------------- | -------------------- |
| RSS/XML           | Entity-escape + strip XML-1.0-forbidden control chars             | `utils/rss.js`       |
| ICS               | Escape `\ ; ,` + newlines, 2000-char cap, skip invalid dates      | `utils/calendar.js`  |
| Telegram HTML     | Escape `& < > "`, surrogate-safe truncation, `http(s)`-only hrefs | `utils/notify.js`    |
| Discord embeds    | `http(s)`-only URLs, truncation                                   | `utils/notify.js`    |
| CSV               | `'`-prefix cells starting with `= + - @` (formula injection)      | `utils/csv.js`       |
| SQLite            | Parameterized statements only, never string-built SQL             | `utils/notifydb.js`  |
| Shell (workflows) | Inputs via env vars; single-pass expansion audited                | `.github/workflows/` |

Accepted risks: Discord Markdown can be cosmetically broken by hostile
text (no code execution); truncated strings count UTF-16 units (limits stay
conservative).

## Availability

- **Alert quarantine**: a poison job that fails sending is retried, then
  quarantined after 3 attempts — one bad record can never fail every run
  forever (`state.quarantine`, loud warning, delete state to force retry).
- **Fail-soft everywhere**: dead feeds, blocked domains, enrichment API
  outages and corrupt state files warn and continue; nothing partially
  written is left behind (state rollback on alert failure).
- **Bounded work**: page/item/record caps, table-span clamps, regex input
  caps (ReDoS), per-layer Bloom capacities with geometric growth.

## Secrets & supply chain

- Credentials come from **environment variables only** — never CLI flags
  (they leak into shell history and process listings). Automation secrets
  live in GitHub Actions secrets.
- `npm audit` runs in CI (`--audit-level=high`) and must stay at
  0 vulnerabilities; Dependabot updates npm + Actions weekly; `sql.js` was
  chosen over native SQLite drivers to avoid binary-download supply chain
  steps.
- `*.db` archives are gitignored: alert history never belongs in git.

## Reporting

Found a hole? Open an issue with a minimal repro (fixture HTML, not a live
attack). Do not post credentials or private alert history — redact first.
