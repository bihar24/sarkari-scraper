# Sarkari Explorer: an integrated product

Explorer adds a read-only website, versioned JSON API and persistent catalogue
on top of the existing job/paper scraper. Node.js **22+** is required; there
is no frontend build, hosted database, AI subscription or API key requirement
to run the local product. The only new runtime dependency is `yaml`.

## What we took from the two references

| Reference                     | Integration                                                                                                    | Deliberately not done                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Bihar Policy & Scheme Tracker | Import its bilingual scheme/policy YAML, retain evidence and per-record licence, expose search/details/exports | Copy its Next.js code, execute migrations, fabricate metrics, assert that importing verifies a scheme |
| captn3m0 domain gist          | Optional pinned Markdown import, dedupe, exact-host lookup, source-discovery view                              | Crawl thousands of domains, auto-enable parsers, treat membership as trust or authorization           |

On 7 September 2026, the tracker API discovery returned zero counts and its
schemes endpoint returned `internal error`. Its list API also documents a
50-result cap. Therefore **the complete, pinned YAML catalogue is the import
contract**, not an assumption that a capped live API response is the whole
dataset. The reviewed snapshot contains 84 schemes and 12 policies. Counts
can change with a different revision. No complete upstream dataset is
committed here. See [THIRD_PARTY.md](../THIRD_PARTY.md).

## Quick start

```sh
npm ci

# Offline, clearly fictional examples. No state files or network calls.
npm run demo

# Or: a real catalogue. Stop the demo before starting the same port.
npm run catalog:import -- --tracker-github
npm start
```

Open the server on port 3000. It binds to `0.0.0.0` and accepts reverse-proxy
hosts, including Arena preview hosts. The browser uses same-origin `/api/v1`
URLs; it never calls a backend at `localhost` or the upstream tracker.
`npm start -- --port 8080` selects another port.

The GitHub importer makes read-only requests to a pinned tree and its blobs,
with bounded concurrency and retries. Set `GITHUB_TOKEN` in the environment
if your API quota requires it; do not pass credentials as command arguments.
If a network uses a custom CA, configure `NODE_EXTRA_CA_CERTS` with the trusted
CA bundle. **Never disable TLS verification.**

For a local tracker checkout:

```sh
npm run catalog:import -- --tracker-dir ../bihar-scheme-tracker
```

It reads YAML only and never executes upstream scripts. Provide
`--tracker-ref <full-40-character-SHA>` only when the local files actually
match that revision. Remote imports default to the reviewed SHA in
`catalog/importers.js`; update explicitly after reviewing upstream changes:

```sh
npm run catalog:import -- --tracker-github --tracker-ref <full-commit-sha>
```

## Bring in our jobs and papers

```sh
mkdir -p .sarkari
node run-scrapper.js -d sarkariresult.com -f json \
  -o .sarkari/jobs.json --max-pages 1 --max-jobs 10
npm run catalog:import -- --jobs .sarkari/jobs.json

node scrap-paper-list.js -d upsc.gov.in -f json -o .sarkari/papers.json
npm run catalog:import -- --papers .sarkari/papers.json
```

Job-list JSON is also supported. Paper detail records must be wrapped as
`[{"url":"https://...","detail":[...]}]`, like full job-scrape output.
Papers are links/metadata, **not PDF contents, OCR, or a question bank**.
Empty or source-link-only details are rejected. Failed detail pages do not
replace good existing records. A partial scrape imports usable records but
returns exit code 1 and reports partial source health.

`--jobs` and `--papers` use the input **basename** as their collection name:
use distinct, stable basenames for independent input streams. File-based
imports keep existing records incrementally because a `--max-jobs` scrape
is not evidence that older listings were removed.

## Import the domain directory

```sh
# Recommended when the raw gist is blocked or unavailable:
npm run catalog:import -- --domains /path/to/01-domains.md

# Explicit opt-in to downloading the pinned historical gist:
npm run catalog:import -- --fetch-domains
```

For local files, attach a known provenance URL with
`--directory-source <original-url>`; this URL is recorded, not fetched.

The parser supports the gist's `- domain` and `- [domain](http://domain/)`
formats, plus plain domain lines. It lowercases hosts, deduplicates, rejects
wildcards/IP literals/credentials and does exact membership checks. It does
not validate liveness, follow links or infer authority for a listed host's
subdomains. Neither a match nor a government namespace is proof of ownership.

No full directory is bundled. Its licence is unspecified, its contents are
historical, and its author says it is no longer updated. Review rights before
publishing imported results. A failed download is recorded as a source error;
it leaves prior catalogue records and a previous good directory intact.

## Dashboard

- Search English or Hindi titles/descriptions; filter by kind, category,
  coverage region, recorded persona, namespace or review freshness.
- Show upstream verification dates separately from import dates. Evidence
  older than 90 days is marked for review; imports never reset that clock.
- Inspect benefits, eligibility, application links, documents and original
  JSON, including budgets and missing/RTI-needed figures.
- Save up to 100 record IDs in browser-local storage; no account, profiles,
  analytics or server-side personal data collection. Browser restrictions
  may limit saves to the current session.
- Explore import health, supported parsers and the optional directory.
- Export JSON, CSV, RSS and calendars. A recorded deadline is not a guarantee
  that applications or consultations remain open.

Region labels describe catalogue coverage, not a final domicile/eligibility
ruling. Scheme status is an **upstream assertion with evidence**, not an
independent verification by this product. A policy's date window alone is
not used to label its implementation active. Unknown criteria do not exclude
people from results. Always confirm eligibility and deadlines at the source.

## Read-only API

Discovery: `GET /api/v1`.

| Endpoint                             | Result                                                              |
| ------------------------------------ | ------------------------------------------------------------------- |
| `/api/v1/opportunities`              | Search summaries, `{schemaVersion,total,limit,offset,demo,results}` |
| `/api/v1/opportunities/{encoded-id}` | Full record, source, original data and attribution                  |
| `/api/v1/sources`                    | Import health, scraper coverage, directory metadata                 |
| `/api/v1/domains?q=bihar`            | Historical host lookup, not ownership verification                  |
| `/api/v1/changes`                    | Latest 200 added/updated/removed import events                      |
| `/api/v1/export?format=json`         | Complete matching records, original fields, licences                |
| `/api/v1/export?format=csv`          | Spreadsheet-safe summaries and attribution                          |
| `/api/v1/export?format=rss`          | Source-linked RSS feed with attribution                             |
| `/api/v1/export?format=ics`          | Parsed application/consultation dates with attribution              |
| `/health`                            | Availability, data readiness and demo status                        |

Opportunity filters: `q`, `kind=job|scheme|policy|paper`, `category`,
`region=bihar|india`, `source`, `freshness`, `status`, `namespace`, `persona`,
`age`, `income`. Age/income are optional query criteria and are not persisted by this service.
Browser history or a reverse proxy may still retain query strings; avoid
sending sensitive personal information.
`namespace=government_namespace|historical_directory|unclassified` is a
classification, not a trust decision. `freshness` uses `recently_reviewed`,
`needs_review`, `unverified` or `invalid_date`.

`limit` is 1–100 (default 24); `offset` is non-negative and capped at 10,000.
Search strings are capped at 200 characters. Filters combine with AND.
Unknown structured eligibility is not treated as a denial. These are possible
matches, not eligibility determinations. Exports use the same filters but
ignore pagination; narrow the filters when more than 1,000 records match.

```js
// Browser code: use relative URLs, through your own origin/proxy.
const response = await fetch(
  "/api/v1/opportunities?kind=scheme&category=education&limit=10"
);
if (!response.ok) throw new Error("Catalogue unavailable");
const { results, total } = await response.json();
```

GET/HEAD/OPTIONS only; no remote scrape/import, arbitrary URL fetch, SQL or
file-write endpoint. CORS is open intentionally for this **public** catalogue.
Don't import private data into a publicly reachable instance. Add reverse-proxy
rate limiting and any authentication your deployment requires. No public
request can trigger an upstream fetch.

## Node integration

```js
const { catalogue, sources } = require("sarkari-scraper");
const groups = catalogue.importers.importTrackerDirectory("../tracker");
const snapshot = catalogue.store.update(".sarkari/catalog.json", (current) => {
  for (const group of groups) catalogue.store.applyGroup(current, group);
  return current;
});
const schemes = catalogue.search(snapshot, { kind: "scheme" });
const parser = sources.requireListParser("sarkariresult.com", "jobs");
// parser.scrapeJobList(html, pageUrl) parses supplied HTML only.
```

The root import is side-effect-free. It does not start a server, make network
requests or write files. Types are in `index.d.ts`. The normalized record
contract is also described by `schemas/opportunity.schema.json`.

## Persistence, failure and scheduling

The default runtime file is `.sarkari/catalog.json`, gitignored and separate
from MIT source. Override it with `--store <file>`. It contains records,
per-source health, bounded change history and the optional domain directory.
Keep backups and persist this directory across container restarts.

- Writes use a same-directory temporary file plus atomic rename.
- A short exclusive `.lock` covers read/merge/write, preventing lost updates.
  If a killed process leaves a lock, confirm no importer is running, then
  remove **only that catalogue's `.lock` file** and retry. Live locks are
  never automatically stolen.
- Schemes and policies are independent, all-or-nothing snapshot collections;
  one invalid YAML/blob prevents replacing that collection. A failed
  collection is retained while another successful collection may update.
- A complete tracker snapshot may remove old IDs. Bounded scraped inputs
  merge incrementally instead of deleting records outside the current batch.
- A content hash detects revisions at the same ID, not just new URLs.
  Import timestamps and upstream Git revisions alone do not generate changes.
- A corrupt catalogue is not silently overwritten by an importer. The running
  server keeps its last good in-memory snapshot and returns degraded health
  if a replacement cannot be read.
- Imports return 0 on success, 1 on failure/partial results, 2 on usage errors.
  Do not interpret HTTP service health as proof that every source is fresh;
  monitor `/api/v1/sources` as well.

Schedule CLI imports with your existing cron/worker and supervise the server.
Do not run a full scrape in an HTTP request. A fixed tracker revision is
reproducible, **not self-updating**: advance it deliberately after review.
The legacy GitHub scrape workflow is not automatically changed into a
website deployment by this feature.

## Deployment

```sh
docker compose up --build -d
docker compose run --rm explorer node tools/catalog.js import --tracker-github
```

The named volume persists `.sarkari/`; only port 3000 is published. Serve
behind your TLS reverse proxy. Optional `CATALOG_PUBLIC_URL` supplies the feed
channel URL; it is never inferred from an untrusted Host header. Back up the
volume, not just source code. `docker compose down -v` destroys catalogue data.

## Existing functionality and remaining limits

All six original CLI names still work. Empty full job crawls now fail without
replacing the last output; redirects are checked against site/robots policy
before fetching; use `--allow-external` only for permitted external targets.
Secret-bearing request URLs are redacted. Dry runs no longer consume alert
state or create a notification DB. Nested labelled deadlines are recognized.

The legacy alert pipeline remains separate from this read-only catalogue;
its **multi-transport batch retry/quarantine semantics have not been rebuilt**.
Use the existing job JSON with `job-digest.js` for alerts. RSS exports are the
new catalogue's subscription interface, not an exactly-once notification
service. There is no account system, hosted subscription worker, admin editor,
semantic cross-portal dedupe, crawler for every directory entry, live
eligibility verification, or spending-audit engine. This is an integrated
self-hostable foundation, not a replacement for official notices.

## Verification

`npm test` includes offline fixtures, mocked GitHub blobs, source failure
retention, concurrency locks, bilingual search, HTTP boundary/export tests,
and regressions for credentials, robots and dry-run state. `npm run typecheck`
checks the public declarations with a TypeScript consumer. The website has
no build step; run `npm run lint`, `npm run format:check` and `npm audit` too.

The browser regression suite uses only fictional in-memory records. It checks
English/Hindi search, local saves, mobile navigation, directory lookup and
escaping hostile source text in the real UI:

```sh
npx playwright install --with-deps chromium
npm run test:browser
```

CI runs this in a separate Chromium job. Browser binaries are test tooling,
not runtime dependencies or committed artifacts.
