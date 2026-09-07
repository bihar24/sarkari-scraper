# Source catalog

The single source of truth is the registry in `utils/sources.js`
(`node <any-cli>.js --list-sources` prints it). This page explains what each
status means, what every source does, and what is wanted next.

## Statuses

- `stable` — long-standing parser, widely used.
- `beta` — fixture-tested parser that **still needs live validation**: run it
  against the real site, compare with a browser, then report back
  (see `CONTRIBUTING.md` “validating a beta source”). Beta scrapes print a
  stderr warning on every run.
- `disabled` — source is unavailable/parked/blocked from automated runners;
  the parser is retained for historical compatibility but failures are
  expected and previous valid data is retained.

## Jobs

| Domain                  | Status   | List entry                                           | How it works                                                                    |
| ----------------------- | -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `sarkariresult.com`     | stable   | site homepage sections                               | Per-site selectors                                                              |
| `sarkariexam.com`       | stable   | site homepage sections                               | Per-site selectors                                                              |
| `sarkariresults.info`   | disabled | site homepage sections                               | Does not resolve / parked from automated runners; previous data retained        |
| `freshersnow.com`       | stable   | site homepage sections                               | Per-site selectors                                                              |
| `freejobalert.com`      | beta     | `https://www.freejobalert.com/latest-notifications/` | Content-driven `/articles/` link harvest; detail via the generic article reader |
| `employmentnews.gov.in` | beta     | `https://www.employmentnews.gov.in/`                 | Official weekly journal; generic harvest, needs live tuning                     |
| `rojgarresult.com`      | beta     | `https://rojgarresult.com/`                          | Generic harvest, needs live tuning                                              |

## Papers (previous-year question papers)

| Domain        | Status | List entry                                                             | How it works                                                                                                                             |
| ------------- | ------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `upsc.gov.in` | beta   | `https://www.upsc.gov.in/examinations/previous-question-papers`        | Official PDFs: exam-filter links when the page exposes them, else PDFs grouped under exam headings; detail pages list every PDF per exam |
| `adda247.com` | beta   | `https://www.adda247.com/exams/ssc/ssc-previous-year-question-papers/` | Exam-hub tables → per-exam pages with shift-wise English/Hindi PDF tables                                                                |

## Wanted (help welcome!)

These are frequently requested but have **no parser yet** — see
`CONTRIBUTING.md` to add one with `npm run new-source`:

- **Testbook** previous-year papers — likely a JS app / internal API; needs
  someone to inspect the live network traffic and document a stable entry.
- **Prepp.in** papers — same: inspect before coding.
- **JagranJosh** education/jobs sections.
- **ssc.gov.in** official notices/papers.
- **FreshersWorld** jobs (known to be bot-sensitive; needs care + proxies).

Please don't submit parsers built from guessed URLs or selectors: every new
source needs fixture HTML in `test/` **and** a live-validation report
(what URL, what date, how many items, spot-checked against a browser).

## Shared engines

Beta parsers are intentionally thin wrappers around content-driven helpers
instead of fragile per-site CSS selectors:

- `utils/harvest.js` — `harvestLinks` (content links + nearby dates),
  `harvestPdfLinks` (PDF anchors), `harvestPdfGroups` (PDFs grouped under
  their nearest heading).
- `utils/article.js` — `extractArticle`: title + headed sections
  (paragraphs / lists / tables / link boxes) as standard records.

Tune with options (`includePattern`, `minText`, `scope`, `roots`) before
reaching for custom selectors — generic fixes help every source.
