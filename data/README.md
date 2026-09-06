# data/ — automation outputs (committed)

This directory is written by the GitHub Actions workflows
(`.github/workflows/`) and committed back to the repo:

- `jobs-<domain>.json` — raw run-scrapper output per job domain.
- `jobs-all.json` — all domains merged (digest input).
- `papers-<domain>.json` — exam/paper lists per papers domain.
- `digest.json`, `feed.xml`, `digest.ics` — digest outputs: enriched JSON,
  RSS 2.0 feed and deadline calendar.
- `digest.state.json` — digest new-job diffing state (do not delete, or the
  next run alerts on everything as "new").
- `feed-state.json` — RSS watcher seen-items state.
- `lastrun.json` — metadata about the latest run (timestamp, trigger,
  reason, domains). It changes on every run, which also keeps the scheduled
  workflows alive (see docs/AUTOMATION.md).

Only `README.md` is checked in by hand; everything else is generated. Do not
hand-edit generated files — the next workflow run overwrites them.
