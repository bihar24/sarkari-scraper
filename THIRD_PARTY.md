# Third-party data & attribution

The original Sarkari Scraper / Explorer integration code remains under the
[MIT licence](LICENSE). **That licence does not relicense imported data.**
No source code, migrations, UI components, RTI PDFs, or full datasets from the
projects below are vendored into this repository.

## Bihar Policy & Scheme Tracker

- Project: <https://github.com/fossdot/bihar-scheme-tracker>
- Attribution: **Bihar Policy & Scheme Tracker by Vishal Arya / Bodhya —
  <https://yojana.bodhya.net>**.
- Upstream licence: **CC BY-SA 4.0**, covering its data, content and code.
- Licence: <https://creativecommons.org/licenses/by-sa/4.0/>;
  [legal text](https://creativecommons.org/licenses/by-sa/4.0/legalcode).
- Reviewed import revision: `32b041f52a87f51e2c3d229bcc77e71518eff70c`.

The adapter reads `data/schemes/*.yaml` and `data/policies/*.yaml` and maps
records to our catalogue format. English/Hindi fields, source URLs, original
verification dates, evidence, budget/metric provenance, and **null values**
are retained. The complete upstream record remains under `original`.

These are adaptations of the **data**, not new MIT-licensed scheme records.
When sharing them, retain the upstream attribution, licence link and change
notice; distribute adaptations under CC BY-SA 4.0 as required by that licence.
The UI and JSON/CSV/RSS/ICS exports carry attribution. Original government
source links remain attached. Do not imply endorsement by Bodhya or a
Government department. Review applicable rights for your distribution.

## captn3m0’s government-domain directory

- Gist: <https://gist.github.com/captn3m0/4f3da8f07fe884e62bfab3ac85616936>
- Reviewed revision: `27f26717533ba451e56a8769fb0eb224605c12a5`.
- Files: `01-domains.md` (directory), `02-README.md` (methodology).
- The methodology cites `goidirectory.nic.in` and certificate-transparency
  results from `crt.sh` for `*.gov.in`.
- **No explicit licence was found in the gist.** We do not infer MIT,
  CC BY-SA, or permission to redistribute the compilation. Review rights or
  obtain permission before redistributing imported directory data.

The author stated in a January 2023 comment that the gist is not updated and
pointed readers to the `domains.csv` file in the author's Pulse project.
This integration does not automatically follow or trust that alternative.

The gist is an **optional, historical discovery input**, not an official,
complete, current or security-authoritative registry. We do not vendor it or
fetch it on startup. Operators can explicitly import a local copy with
`--domains` or request the pinned file with `--fetch-domains`. Exact hostname
membership is shown independently of the `gov.in` / `nic.in` namespace.
Neither indicator verifies ownership, safety, eligibility or permission to
scrape. **No imported domain becomes a supported scraper or network allowlist
entry. No listed website is fetched by the directory importer.**

## Scraped portal content

A portal's content, question papers and documents keep their original rights.
Our software's MIT licence is not a grant to republish them. Check the site's
terms, robots.txt and document permissions. Link to original evidence and do
not publish private or unredacted personal data.

## Demo data

`catalog/demo.js` contains original, fictional, MIT-licensed examples. They
are explicitly marked as a demo and never mixed into real catalogue imports.
They are not government opportunities and carry no factual eligibility or
benefit promises.

## Self-hosted fonts

The small WOFF2 subsets in `web/fonts/` are **Inter** and **Noto Sans
Devanagari**, distributed under the **SIL Open Font License 1.1**. Their
original copyright/licence notices are retained alongside the fonts as
`Inter-LICENSE.txt` and `NotoSansDevanagari-LICENSE.txt`. Fontsource packages
were used to obtain the unmodified subsets. They are separate from the MIT
application code. Fonts are served locally; opening the app makes no Google
Fonts or other third-party font request.
