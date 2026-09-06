# Automation (GitHub Actions)

Two workflows run the whole pipeline without a server:

```text
Layer 1: RSS watch ── every 30 min ──► new feed items? ──► triggers Layer 2
Layer 2: Scrape ── daily sweep + on demand ──► data/ committed (jobs, digest, RSS feed)
```

- `.github/workflows/rss-watch.yml` — the **news layer**. Polls the feeds in
  `feeds.txt` (see `tools/rss-watch.js`), records seen items in
  `data/feed-state.json`, and triggers the Scrape workflow when something new
  appears.
- `.github/workflows/scrape.yml` — the **scraper**. Scrapes the job + papers
  domains, rebuilds the digest (`data/digest.json`, `data/feed.xml`,
  `data/digest.ics`), and commits everything to `data/`.

## Triggers

| Workflow  | Trigger             | What starts it                                           |
| --------- | ------------------- | -------------------------------------------------------- |
| RSS watch | schedule (*/30)     | Automatic — polls feeds                                  |
| RSS watch | workflow_dispatch   | Manual — Actions tab → Run workflow                      |
| Scrape    | schedule (daily)    | Automatic fallback sweep, 01:30 UTC (~7 AM IST)          |
| Scrape    | workflow_dispatch   | Manual, with inputs (domains, max-pages, max-jobs)       |
| Scrape    | RSS watcher         | Automatic when new feed items appear (needs `WATCH_PAT`) |
| Scrape    | repository_dispatch | Any external system (see below)                          |

## Secrets (all optional)

| Secret                                    | Purpose                                                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WATCH_PAT`                               | Lets RSS watch trigger Scrape. Classic PAT, `repo` scope (or fine-grained with Actions read+write on this repo). Without it the watcher still reports and you run Scrape manually. |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Failure alert when a Scrape run fails.                                                                                                                                             |

Set them under Settings → Secrets and variables → Actions. No secrets are
needed for scheduled/manual scraping itself.

Why the PAT? [GitHub deliberately does not start new workflow runs from events raised with `GITHUB_TOKEN`](https://runs-on.com/github-actions/triggering-a-workflow-from-another-workflow/)
(loop protection) — a second identity is required for workflow-to-workflow
triggers. A short-lived GitHub App token works too and is safer at scale.

## Will the schedule keep firing?

GitHub [auto-disables scheduled workflows after 60 days with no repository activity](https://cronjobpro.com/guides/monitor-github-actions-scheduled-workflows) —
and only **commits** count as activity. This repo is self-sustaining by
design: every Scrape run commits `data/lastrun.json` (timestamp, trigger,
reason), so an active schedule keeps itself alive. Two honest caveats:

- If you pause the workflows for 60+ days, GitHub disables the schedules —
  re-enable them under the Actions tab and press Run workflow once.
- Cron runs can lag under load and [never run on forks](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
  until manually enabled there. For time-critical alerts, trigger a manual
  run instead of waiting for the next slot.

## External triggers (your own "news layer")

`repository_dispatch` lets **any** outside watcher trigger a scrape — a cron
job on your server, a Pipedream/Zapier flow, or a future Telegram/Twitter
monitor:

```sh
curl -X POST \
  -H "Authorization: Bearer $GH_PAT" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/bihar24/sarkari-scraper/dispatches \
  -d '{"event_type":"rss-new-items","client_payload":{"reason":"my watcher saw 3 posts"}}'
```

Notes:

- Twitter/X triggering is intentionally **not** built in: its API is paid
  and free-tier search/streaming is gone, so an RSS-based layer (this repo's
  watcher, or any RSS→webhook bridge) is the practical route today.
- `client_payload.reason` lands in `data/lastrun.json` for traceability.

## Outputs & feed hosting

Every Scrape run commits `data/` (see `data/README.md`) and uploads it as a
30-day artifact. To give aspirants a subscribable feed URL, serve the repo
via GitHub Pages (Settings → Pages → Deploy from branch): `data/feed.xml`
then becomes `https://<user>.github.io/sarkari-scraper/data/feed.xml`.

## Failure handling

- A failed domain warns (`::warning::`) without failing the run; other
  domains still complete.
- A failed run sends a Telegram alert when the secrets are set, and always
  leaves its logs + artifact behind for diagnosis.
- `concurrency` groups serialize pushes so overlapping runs can't conflict.
- Digest state (`data/digest.state.json`) persists across runs, so scheduled
  digests only alert on genuinely new jobs. Never delete it casually.
