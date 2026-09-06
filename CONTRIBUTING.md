# Contributing

Thanks for helping aspirants! This project scrapes government job and
previous-year-paper sites; every addition must genuinely help users and must
be validated against the real web — never from guessed markup.

## Setup

```sh
npm install
npm test          # full suite, no network needed
npm run lint
npm run format:check
```

CI runs lint, format check, tests (Node 18/20/22) and `npm audit` on every
push/PR. A pre-commit hook auto-fixes staged files.

## Adding a source (jobs or papers)

1. **Scaffold it:**
   `npm run new-source -- --domain example.com --type jobs --entry https://example.com/jobs`
   (use `--type papers` for question-paper sites). This creates
   `scripts/<domain>/{job,papers}-{list,detail}.js` on the generic engines.
2. **Register it** as `beta` in `utils/sources.js` with a one-line note.
3. **Tune against the live site:** fetch a real page, adjust options
   (`includePattern`, `minText`, `scope`, `roots`) in `utils/harvest.js` /
   `utils/article.js` terms. Prefer content-driven extraction over CSS
   selectors; selectors rot, content patterns survive redesigns.
4. **Add fixtures + tests** in `test/` (inline representative HTML, like the
   existing `beta-jobs` / `upsc-papers` / `adda247-papers` suites).
   No live network in tests — ever.
5. **Document** the entry URL and method in `docs/SOURCES.md`.
6. **Run** `npm test && npm run lint && npm run format:check && npm audit`.

## Validating a beta source

Beta means “fixture-tested, not yet checked against the live site”. To
promote one to `stable`:

- [ ] Run the list + detail CLIs against the real URLs; save the commands.
- [ ] Spot-check ≥5 items in a browser (titles, links, dates, PDF targets).
- [ ] Confirm `robots.txt` allows the scraped paths (default behaviour).
- [ ] Confirm output-shape validation prints no warnings (`--verbose`).
- [ ] Paste the report (URLs, date, item counts) into your PR; flip the
      registry status to `stable`.

## Code style

- `"use strict"`, `var`, function expressions — match the existing files
  (the codebase intentionally avoids newer syntax for consistency).
- Data → stdout, logs/warnings/errors → stderr; exit `0`/`1`/`2`.
- New `scrap*` exports also get a correctly-spelled `scrape*` alias.
- Prettier + ESLint must pass; keep functions small and commented where
  the “why” isn't obvious.

## Polite scraping rules

- Respect `robots.txt` and Terms of Use; keep the default delays.
- Never commit credentials, tokens, or scraped personal data.
- If a site blocks bots (403s, CAPTCHAs), don't add evasion — document it
  in `docs/SOURCES.md` and move on.

## PR checklist

- [ ] Tests added/updated, `npm test` green
- [ ] `npm run lint`, `npm run format:check`, `npm audit` clean
- [ ] `docs/SOURCES.md` + `CHANGELOG.md` updated for source changes
- [ ] Live-validation report included for parser changes
