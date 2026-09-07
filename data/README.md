# data/ — automation outputs (committed)

This directory is written by the GitHub Actions workflows
(`.github/workflows/`) and committed back to the repo:

- `jobs-<domain>.json` — validated per-domain job snapshot. A source file is
  replaced by the workflow only after the staged output has at least one
  normalizable record; otherwise the previous committed file is retained.
- `jobs-all.json` — aggregate built only from validated job snapshots. Never
  replaced by `[]` while a previously non-empty aggregate exists.
- `papers-<domain>.json` — validated exam/paper list snapshots (beta).
- `papers-all.json` — aggregate of validated paper snapshots (beta).
- `catalog.json` — the intentional deployment snapshot read by Vercel
  (`catalog/deployment.js`). Generated in the scrape workflow from the
  validated jobs/papers plus the pinned Bihar scheme tracker; it is never
  written during a Vercel request.
- `run-status.json` — latest per-source attempt/status metadata.
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
