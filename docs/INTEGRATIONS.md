# Integrations menu ✨

`job-digest.js` turns scraped jobs into enriched alerts using free, keyless
public APIs — discovered via the awesome
[public-apis](https://github.com/public-apis/public-apis) collection
(plus a couple of well-known platform APIs). Everything is **opt-in** and
**fail-soft**: if an API is down or rate-limited, the digest silently falls
back to plain scraped data. Responses are cached in the state file, so repeat
runs are fast and polite.

## Enrichments

| Flag          | API (public-apis category)                                                   | Auth | Limits / notes                                 |
| ------------- | ---------------------------------------------------------------------------- | ---- | ---------------------------------------------- |
| `--summarize` | [Pollinations](https://github.com/pollinations/pollinations) Text API        | None | Free tier, rate-limited; 2-line digest per job |
| `--translate` | [MyMemory](https://mymemory.translated.net/doc/spec.php)                     | None | 5k chars/day; 50k with `TRANSLATE_EMAIL`       |
| `--locate`    | [api.postalpincode.in](https://api.postalpincode.in) (Government)            | None | Pincode → district/state from job text         |
| `--holidays`  | [Nager.Date](https://date.nager.at/Api) (Calendar)                           | None | Flags deadlines on Indian public holidays      |
| `--archive`   | [Internet Archive](https://archive.readme.io/docs) Save Page Now (Open Data) | None | Snapshot link per job; slow, be patient        |
| `--shorten`   | [CleanURI](https://cleanuri.com/docs) (URL Shorteners)                       | None | 2 req/s; compact links in alerts               |
| `--upload`    | [Catbox](https://catbox.moe/tools.php) (Cloud Storage & File Sharing)        | None | Permanent public link for the digest JSON      |

No-key-needed extras built in (no API calls at all):

- **Google Calendar "Remind me" links** and **`--ics` deadline files** —
  parsed from "Last Date" fields, with weekend warnings.
- **`--rss` feeds** — subscribe to new Sarkari jobs in any feed reader.

## Alert transports

| Target   | Setup                                                                                                                                                            | Env vars                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| telegram | Talk to [@BotFather](https://t.me/BotFather) → `/newbot`, then message your bot and open `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your `chat_id` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| discord  | Channel settings → Integrations → Webhooks → New Webhook → copy URL                                                                                              | `DISCORD_WEBHOOK_URL`                    |
| webhook  | Any JSON endpoint (n8n, Zapier, Slack incoming webhooks — payload includes Slack-style `text`)                                                                   | `WEBHOOK_URL`                            |

Credentials come from **environment variables only** — never CLI flags, which
leak into shell history and process listings.

Typical cron setup (daily 7 AM digest of new jobs):

```sh
0 7 * * * cd /opt/sarkari-scraper && \
  node run-scrapper.js -d sarkariresult.com -f json -o jobs.json --quiet && \
  node job-digest.js -i jobs.json --alert telegram --summarize --translate hi \
    --holidays --rss feed.xml --quiet
```

## Ideas from the list we haven't built (yet)

- **Microlink / screenshot APIs** — preview cards for job pages in alerts.
- **data.gov.in (apiKey)** — cross-reference official vacancy datasets.
- **Arbeitnow / Arbeitnow-style boards** — bonus "remote jobs" section.
- **fast2sms (India, free tier)** — SMS alerts for feature-phone users.
- **GitHub Gists (token)** — versioned publishing of the digest instead of Catbox.
- **GitHub Contents API (token)** — commit digest JSON/RSS/ICS to a repo so
  the feed gets a free public URL via GitHub Pages (needs `GITHUB_TOKEN`;
  write path is the only non-keyless idea on this list).
- **Dictionary APIs** — "word of the day" for SSC/Bank aspirants in the digest.
- **caldays / Nager.Date weekends** — "apply early, long weekend ahead" nudges.

PRs welcome — follow the pattern in `utils/enrich.js`: fail-soft, cached,
`baseUrl`-overridable, tested against stub servers.
