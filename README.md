# Sarkari Scraper

[![CI](https://github.com/bihar24/sarkari-scraper/actions/workflows/ci.yml/badge.svg)](https://github.com/bihar24/sarkari-scraper/actions/workflows/ci.yml)
[![Scrape](https://github.com/bihar24/sarkari-scraper/actions/workflows/scrape.yml/badge.svg)](https://github.com/bihar24/sarkari-scraper/actions/workflows/scrape.yml)
[![RSS watch](https://github.com/bihar24/sarkari-scraper/actions/workflows/rss-watch.yml/badge.svg)](https://github.com/bihar24/sarkari-scraper/actions/workflows/rss-watch.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A Node.js web scraper that extracts government job listings and job details
from supported job portals.

## New: Sarkari Explorer

A self-hostable, bilingual product layer now brings **jobs, schemes, policies
and exam resources** together, with a searchable dashboard and read-only API.
It integrates the Bihar Scheme Tracker's versioned YAML catalogue and supports
an optional historical government-domain directory for source discovery.

```sh
npm ci
npm run catalog:import -- --tracker-github
npm start
```

Or try an offline, explicitly fictional preview with `npm run demo`.

- Import our scraper outputs with `npm run catalog:import -- --jobs jobs.json`.
- Search English/Hindi records, save items locally, inspect evidence and
  verification dates, and export JSON, CSV, RSS or deadline calendars.
- Use `/api/v1/opportunities` from your project, or the new side-effect-free
  `require("sarkari-scraper").catalogue` Node API.
- Import a local domain directory with `--domains 01-domains.md`. Directory
  membership is **not** ownership verification or a crawl allowlist.

**Read [the product guide](docs/PRODUCT.md) for setup, API, Vercel/custom-domain
configuration, Docker, scheduling and limitations.** The Vercel build publishes
only the browser app, while one serverless handler provides `/feed.xml`,
`/health` and the read-only API without starting a long-running server. Our
original code is MIT;
imported tracker data remains
**CC BY-SA 4.0** with attribution. See [third-party notices](THIRD_PARTY.md).
Runtime data lives in gitignored `.sarkari/`, not in this repository.

## Installation

Prerequisites: Node.js 22+ (`node --version`, see `.nvmrc`).

**Clone and run** (recommended — full source, tests and docs):

```sh
git clone https://github.com/bihar24/sarkari-scraper.git
cd sarkari-scraper
npm install
node scrap-job-list.js --list-sources
```

**Global install** (use the `sarkari-*` commands from anywhere):

```sh
npm install -g github:bihar24/sarkari-scraper
sarkari-job-list -d sarkariresult.com
```

After a global install (or `npm install` + `npx` inside the repo) these
commands are available: `sarkari-job-list`, `sarkari-job-detail`,
`sarkari-paper-list`, `sarkari-paper-detail`, `sarkari-scrape`,
`sarkari-digest`, and `sarkari-catalog`. You can also run the scripts directly with `node`.

## Supported sources

Jobs and papers sources live in the registry (`utils/sources.js`) with
`stable` / `beta` statuses — run any CLI with `--list-sources` for the live
list. Beta sources work but still need live validation (they warn on every
run). See [docs/SOURCES.md](docs/SOURCES.md) for the full catalog,
per-source notes and the wanted list.

Jobs (`stable`): `freshersnow.com`, `sarkariresult.com`,
`sarkariresults.info`, `sarkariexam.com`

Jobs (`beta`): `freejobalert.com`, `employmentnews.gov.in`,
`rojgarresult.com`

Papers (`beta`): `upsc.gov.in`, `adda247.com`

## CLI usage

Every script prints **data to stdout** and logs / warnings / errors to
**stderr**, so output can be safely redirected (`... > out.json`). Run any
script with `--help` for its full flag list.

Exit codes: `0` success, `1` runtime failure, `2` usage error.

### Job list

```sh
node scrap-job-list.js -d sarkariresult.com
node scrap-job-list.js -d sarkariexam.com -f csv -o jobs.csv
```

| Flag               | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `-d, --domain`     | Site to scrape (default: `sarkariresult.com`)         |
| `-f, --format`     | Output format: `json`, `csv` (default: `json`)        |
| `-o, --output`     | Write output to file (in addition to stdout)          |
| `--max-pages`      | Follow at most N list pages (default: `50`)           |
| `--delay-ms`       | Delay between page requests in ms (default: `1500`)   |
| `--timeout-ms`     | Per-request timeout in ms (default: `30000`)          |
| `--retries`        | Retries per request with backoff (default: `3`)       |
| `--retry-delay-ms` | Base retry delay in ms (default: `1000`)              |
| `--proxy`          | Proxy URL, e.g. `http://user:pass@host:8080`          |
| `--ignore-robots`  | Skip the robots.txt check (default: respect it)       |
| `--allow-external` | Follow off-site pagination links (default: same-site) |
| `--list-sources`   | List supported sources and exit                       |
| `--quiet`          | Log errors only                                       |
| `--verbose, -v`    | Debug logging                                         |
| `-h, --help`       | Show help                                             |

Pagination is followed automatically (with loop detection).

### Job detail

```sh
node scrap-job-detail.js -u https://www.sarkariresult.com/upsssc/01exam2018.php
```

| Flag               | Description                                                |
| ------------------ | ---------------------------------------------------------- |
| `-u, --url`        | Job detail page URL (**required**; host must be supported) |
| `-f, --format`     | Output format: `json`, `csv` (default: `json`)             |
| `-o, --output`     | Write output to file (in addition to stdout)               |
| `--timeout-ms`     | Request timeout in ms (default: `30000`)                   |
| `--retries`        | Retries per request with backoff (default: `3`)            |
| `--retry-delay-ms` | Base retry delay in ms (default: `1000`)                   |
| `--proxy`          | Proxy URL, e.g. `http://user:pass@host:8080`               |
| `--ignore-robots`  | Skip the robots.txt check (default: respect it)            |
| `--allow-external` | Allow permitted off-site redirect targets                  |
| `--list-sources`   | List supported sources and exit                            |
| `--quiet`          | Log errors only                                            |
| `--verbose, -v`    | Debug logging                                              |
| `-h, --help`       | Show help                                                  |

### Papers list (previous-year question papers)

```sh
node scrap-paper-list.js -d adda247.com
node scrap-paper-list.js -d upsc.gov.in -f csv -o papers.csv
```

| Flag               | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `-d, --domain`     | Site to scrape (default: `adda247.com`)               |
| `-f, --format`     | Output format: `json`, `csv` (default: `json`)        |
| `-o, --output`     | Write output to file (in addition to stdout)          |
| `--max-pages`      | Follow at most N list pages (default: `50`)           |
| `--delay-ms`       | Delay between page requests in ms (default: `1500`)   |
| `--timeout-ms`     | Per-request timeout in ms (default: `30000`)          |
| `--retries`        | Retries per request with backoff (default: `3`)       |
| `--retry-delay-ms` | Base retry delay in ms (default: `1000`)              |
| `--proxy`          | Proxy URL, e.g. `http://user:pass@host:8080`          |
| `--ignore-robots`  | Skip the robots.txt check (default: respect it)       |
| `--allow-external` | Follow off-site pagination links (default: same-site) |
| `--list-sources`   | List supported sources and exit                       |
| `--quiet`          | Log errors only                                       |
| `--verbose, -v`    | Debug logging                                         |
| `-h, --help`       | Show help                                             |

Each item is `{ "exam": "...", "title": "...", "link": "..." }` — feed the
link to `scrap-paper-detail.js`.

### Papers detail

```sh
node scrap-paper-detail.js -u https://www.adda247.com/jobs/ssc-cgl-previous-year-question-paper/
```

| Flag               | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `-u, --url`        | Papers page URL (**required**; host must be supported) |
| `-f, --format`     | Output format: `json`, `csv` (default: `json`)         |
| `-o, --output`     | Write output to file (in addition to stdout)           |
| `--timeout-ms`     | Request timeout in ms (default: `30000`)               |
| `--retries`        | Retries per request with backoff (default: `3`)        |
| `--retry-delay-ms` | Base retry delay in ms (default: `1000`)               |
| `--proxy`          | Proxy URL, e.g. `http://user:pass@host:8080`           |
| `--ignore-robots`  | Skip the robots.txt check (default: respect it)        |
| `--allow-external` | Allow permitted off-site redirect targets              |
| `--list-sources`   | List supported sources and exit                        |
| `--quiet`          | Log errors only                                        |
| `--verbose, -v`    | Debug logging                                          |
| `-h, --help`       | Show help                                              |

Records group PDF links under exam/year sections (Adda247 labels include
exam date, shift and language).

### Full scrape (list + every detail page)

```sh
node run-scrapper.js -d freshersnow.com -f csv -o output.csv
```

| Flag               | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `-d, --domain`     | Site to scrape (default: `sarkariresult.com`)        |
| `-f, --format`     | Output format: `json`, `csv` (default: `json`)       |
| `-o, --output`     | Output file (**required**; overwritten on each run)  |
| `--max-pages`      | Follow at most N list pages (default: `50`)          |
| `--max-jobs`       | Scrape at most N jobs; `0` = no limit (default: `0`) |
| `--concurrency`    | Parallel detail requests, 1–10 (default: `1`)        |
| `--delay-ms`       | Delay between requests in ms (default: `1500`)       |
| `--timeout-ms`     | Per-request timeout in ms (default: `30000`)         |
| `--retries`        | Retries per request with backoff (default: `3`)      |
| `--retry-delay-ms` | Base retry delay in ms (default: `1000`)             |
| `--proxy`          | Proxy URL, e.g. `http://user:pass@host:8080`         |
| `--ignore-robots`  | Skip the robots.txt check (default: respect it)      |
| `--allow-external` | Scrape off-site job links (default: same-site only)  |
| `--quiet`          | Log errors only                                      |
| `--verbose, -v`    | Debug logging                                        |
| `-h, --help`       | Show help                                            |

Output shapes:

- `json`: `[ { "url": "...", "detail": [ {key, value, type}, ... ] }, ... ]`.
  Pages that failed carry `{ "url": "...", "detail": null, "error": "..." }`.
- `csv`: one row per record with a `sourceUrl` column; failed pages produce
  one row with an `error` column.

### Job digests & alerts ✨

`job-digest.js` turns scraped JSON into an enriched alert digest: new-job
detection, AI summaries, Hindi translations, pincode locations,
holiday-aware deadlines, archive links, RSS/ICS feeds, Telegram / Discord /
webhook alerts and one-click publishing — via free keyless public APIs.
See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for the full menu.

```sh
node run-scrapper.js -d sarkariresult.com -f json -o jobs.json
node job-digest.js -i jobs.json --alert telegram --summarize --translate hi \
  --holidays --rss feed.xml --ics dates.ics
```

| Flag          | Description                                                            |
| ------------- | ---------------------------------------------------------------------- |
| `-i, --input` | run-scrapper JSON output (**required** unless `--rss-input`)           |
| `--rss-input` | Comma-separated RSS/Atom feed URL(s) to digest (merges with `-i`)      |
| `--state`     | State file for new-job diffing + cache (default: `<input>.state.json`) |
| `--alert`     | Comma-separated: `telegram,discord,webhook`                            |
| `--all`       | Alert on every job, not just new ones                                  |
| `--dry-run`   | Print alert payloads to stdout, send nothing                           |
| `--summarize` | AI 2-line summary per job                                              |
| `--translate` | Translate titles, e.g. `hi`                                            |
| `--locate`    | Pincode → district/state enrichment                                    |
| `--holidays`  | Flag deadlines on Indian public holidays                               |
| `--archive`   | Wayback Machine snapshot link per job                                  |
| `--shorten`   | Short alert links                                                      |
| `--rss`       | Write an RSS 2.0 feed                                                  |
| `--ics`       | Write an iCalendar deadlines file                                      |
| `--out`       | Write enriched digest JSON                                             |
| `--upload`    | Publish `--out` to Catbox and print the URL                            |
| `--db`        | Archive notified jobs in SQLite; Bloom filter skips re-alerts          |

Credentials come from environment variables (`TELEGRAM_BOT_TOKEN` /
`TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`, `WEBHOOK_URL`). The first non-dry run only
initialises state; alerts start on the next run. Dry runs do not write alert
state or notification archives.

**RSS input:** any job-portal feed works — no scraper needed for that site:

```sh
node job-digest.js --rss-input https://portal.example/feed --alert telegram --dry-run
```

Feed items flow through the same new-job diffing, summaries, translations
and alerts as scraped jobs (dead feeds warn and skip; `robots.txt` is
respected). To find a feed, look for an RSS link in the portal's footer or
try appending `/feed/` on WordPress-based portals — if your browser shows
XML, the URL works here.

## Automation (GitHub Actions)

Two workflows run the pipeline without a server — see
[docs/AUTOMATION.md](docs/AUTOMATION.md) for triggers, secrets and limits:

- **RSS watch** (every 30 min): polls the feeds in `feeds.txt`; on new
  items it triggers Scrape (needs a `WATCH_PAT` secret, else run Scrape
  manually).
- **Scrape** (daily ~7 AM IST + on demand): scrapes the job/papers domains,
  rebuilds `data/digest.json`, `data/feed.xml`, `data/digest.ics` and
  commits everything to `data/`.

Every run commits `data/lastrun.json`, which counts as repository activity
so GitHub keeps the schedules enabled. Any external watcher can also trigger
a scrape via the `repository_dispatch` API.

## Reliability & politeness

- **Retries**: transient failures (timeouts, connection resets, HTTP 429/5xx)
  are retried with exponential backoff + jitter; `Retry-After` is honoured.
- **robots.txt**: respected by default (fetched once per origin, cached).
  Override with `--ignore-robots` only if the site permits it.
- **Same-site guard**: pagination and job links that lead off-site are
  skipped (override with `--allow-external`); off-site redirects are rejected before fetching unless explicitly allowed.
- **Rate limiting**: requests are sequential with a 1.5s delay by default.
  Raise `--concurrency` cautiously — the tool caps it at 10.
- **Proxies**: `--proxy http://user:pass@host:8080`, or set `HTTPS_PROXY` /
  `HTTP_PROXY` (`NO_PROXY` is honoured).
- The tool identifies itself via User-Agent. Before scraping a site, check
  its `robots.txt` and Terms of Use.
- Scraped content is treated as untrusted at every output boundary
  (see [docs/SECURITY.md](docs/SECURITY.md)); repeated alert failures
  quarantine the offending jobs instead of failing forever.

## Development

```sh
npm install        # install dependencies
npm test           # run the test suite (no network access required)
npm run coverage   # test suite with coverage report
npm run lint       # eslint
npm run format:check  # prettier check (npm run format to fix)
npm audit          # check dependencies for known vulnerabilities
```

A pre-commit hook (husky + lint-staged) runs ESLint and Prettier on staged
files. CI runs lint, format check, tests (Node 22/24) and `npm audit` on
every push/PR. See [CHANGELOG.md](CHANGELOG.md) for release notes.

Project layout:

- `scrap-job-list.js`, `scrap-job-detail.js`, `scrap-paper-list.js`,
  `scrap-paper-detail.js`, `run-scrapper.js`, `job-digest.js` — CLI entry points
- `scripts/<domain>/{job,papers}-{list,detail}.js` — per-site parsers
  (each `scrap*` export also has a correctly-spelled `scrape*` alias)
- `utils/` — arg parsing, HTTP client, crawler, retries, robots.txt,
  worker pool, CSV formatting, validation, logging, enrichment,
  notifications, digest model, calendar/RSS builders, shared runtime,
  source registry, harvest/article engines
- `catalog/`, `web/`, `tools/catalog.js` — normalized catalogue, read-only API,
  bilingual dashboard and import CLI (see [docs/PRODUCT.md](docs/PRODUCT.md))
- `tools/new-source.js` — beta-source scaffold (`npm run new-source`)
- `tools/rss-watch.js` + `feeds.txt` — feed poller behind the RSS-watch workflow
- `tools/notify-db.js`, `utils/notifydb.js`, `utils/bloom.js` — SQLite
  notification archive with Bloom pre-filter (see `docs/STORAGE.md`)
- `.github/workflows/` — CI, scheduled Scrape, RSS-watch news layer
- `data/` — committed automation outputs (jobs, digest, RSS feed, states)
- `docs/SOURCES.md` — source catalog with statuses and the wanted list
- `docs/INTEGRATIONS.md` — the public-API magic menu behind `job-digest.js`
- `test/` — `node:test` suite with fixture HTML and local-server
  integration tests (no live network)

## Troubleshooting

- **Empty results / only a "Post Link" record**: the site's HTML has likely
  changed and the selectors in `scripts/<domain>/` need updating. The tools
  print a warning to stderr in this case.
- **Blocked by robots.txt**: the site disallows the path. Only bypass with
  `--ignore-robots` if you have permission.
- **HTTP 403 / timeouts**: the site may be blocking automated clients. Try a
  longer `--delay-ms`, fewer retries, a proxy, or check the page in a browser.

## License

MIT for the original code — see [LICENSE](LICENSE). Original work © 2019
kaushalmeena; new contributions © 2026 Bihar24. Imported tracker data remains
CC BY-SA 4.0, self-hosted fonts are SIL OFL 1.1, and scraped content retains
its publisher’s rights. See [THIRD_PARTY.md](THIRD_PARTY.md).
