# Storage

How this project stores scraped data — from plain scrape outputs to the
SQLite notification archive with its Bloom pre-filter.

## File outputs (the original layer)

Everything starts as files; there is no server database in the core flow:

| Artifact                                | Producer                               | Shape                               |
| --------------------------------------- | -------------------------------------- | ----------------------------------- |
| `jobs-*.json` / CSV                     | `run-scrapper.js`, `scrap-job-list.js` | Raw lists + `{url, detail}` records |
| `papers-*.json`                         | `scrap-paper-list.js`                  | `{exam, title, link}` items         |
| `digest.json`, `feed.xml`, `digest.ics` | `job-digest.js --out/--rss/--ics`      | Enriched digest, RSS 2.0, calendar  |
| `*.state.json`                          | `job-digest.js`                        | Seen-URL stamps + enrichment cache  |
| `feed-state.json`                       | `tools/rss-watch.js`                   | Seen feed-item links                |

State files are the day-to-day dedup: `state.jobs[url]` stamps plus a
content-hashed enrichment cache. They are exact, but they are also
deletable — lose one and the next run re-alerts on everything. That is what
the archive below backstops.

## Notification archive (SQLite + Bloom)

`job-digest.js --db notifications.db` records every **successfully sent**
alert in a single-file SQLite database (via `sql.js` — pure WASM, no native
builds, works on Node 22+ and in Codespaces):

```sh
node job-digest.js -i jobs.json --alert telegram --db notifications.db
node tools/notify-db.js --db notifications.db --stats
node tools/notify-db.js --db notifications.db --check https://site.test/job/1
node tools/notify-db.js --db notifications.db --recent 5
node tools/notify-db.js --db notifications.db --export backup.json
```

Schema: `notifications(url PK, title, source, first_seen, last_seen,
payload)` plus a `meta` table that stores the serialized Bloom filter —
so the filter travels inside the same single file.

Two-tier "already notified?" check (`utils/notifydb.js` + `utils/bloom.js`):

1. **Scalable Bloom pre-filter** (in memory; starts small for ~2k URLs and
   grows geometric layers with tightening fp rates as needed): a negative
   is _definitive_ — the URL is definitely new (no false negatives, ever).
   Old single-filter snapshots keep loading untouched.
2. **Exact table lookup**: positives are confirmed against SQLite, so a
   Bloom false positive just costs one indexed read — users never see a
   false "already notified".

Semantics: the backstop filters fresh alerts (so state loss can't cause
re-alert storms), recording happens only after successful sends (dry runs
and failed transports record nothing; failures still roll back state), and
`--all` explicitly overrides the backstop for rebroadcasts. Writes are
batched (`recordMany`) because the WASM engine rewrites the whole file on
save. Retention is explicit: `--prune <days>` forgets old rows — safe for
the filter by construction (stale bits become extra positives the exact
table re-confirms, so forgotten URLs simply re-alert). See
`docs/SECURITY.md` for the full threat model.

## Codespaces hosting

The database is designed to live **only in the workspace** (local clone or
GitHub Codespace — see `.devcontainer/devcontainer.json` for one-click
setup). `*.db` files are gitignored on purpose: archives contain your alert
history and grow unboundedly, so they never belong in git.

Codespaces are ephemeral: stopped codespaces are auto-deleted after the
retention period. Treat the live DB as working storage and keep backups:

```sh
node tools/notify-db.js --db notifications.db --export backup-$(date +%F).json
```

Download the export via VS Code (right-click → Download) or
`gh codespace cp remote:~/workspaces/sarkari-scraper/backup.json ./`. The
JSON export is the portable format — re-imports are deliberate human work,
not automation, so history is never silently rewritten.
