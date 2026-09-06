#!/usr/bin/env node
"use strict";

// Usage: node tools/new-source.js --domain <domain> --type <jobs|papers> [--entry <url>] [--root <dir>]
// Scaffolds a beta source parser pair under scripts/<domain>/. The new
// parser starts on the generic harvest/article engines; see CONTRIBUTING.md
// for how to tune and validate it, then register it in utils/sources.js.

var fs = require("fs");
var path = require("path");

var HELP = [
  "Usage: node tools/new-source.js --domain <domain> --type <jobs|papers> [flags]",
  "",
  "Flags:",
  "  --domain <domain>   Bare domain, e.g. example.com (no scheme, no www).",
  "  --type <type>       jobs or papers.",
  "  --entry <url>       List-page entry URL (default: https://<domain>/).",
  "  --root <dir>        Repo root to scaffold under (default: detected).",
  "  -h, --help          Show this help.",
  "",
  "Example:",
  "  node tools/new-source.js --domain example.com --type jobs --entry https://example.com/jobs",
];

function fail(message) {
  console.error("Error: " + message);
  process.exit(2);
}

function flagValue(argv, name) {
  var index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) {
    return null;
  }
  return argv[index + 1];
}

function validDomain(domain) {
  // Length cap first: 253 is the DNS ceiling, and it also bounds the
  // nested-quantifier regex below against pathological input (ReDoS).
  return (
    typeof domain === "string" &&
    domain.length <= 253 &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
      domain
    ) &&
    domain.indexOf("www.") !== 0
  );
}

function jobsListTemplate(domain, entry) {
  return (
    '"use strict";\n' +
    "\n" +
    "// BETA source (see docs/SOURCES.md): " +
    domain +
    ".\n" +
    "// Tune includePattern/minText against the live listing, add fixtures\n" +
    "// in test/, then register this domain in utils/sources.js.\n" +
    "\n" +
    'var harvest = require("../../utils/harvest");\n' +
    "\n" +
    "function scrapJobList(html, pageUrl) {\n" +
    "  var links = harvest.harvestLinks(html, pageUrl, {\n" +
    "    minText: 20,\n" +
    "    maxLinks: 150,\n" +
    "  });\n" +
    "  var data = links.map(function (entry) {\n" +
    "    return { postName: entry.title, date: entry.date, link: entry.link };\n" +
    "  });\n" +
    "  return { data: data, next: null };\n" +
    "}\n" +
    "\n" +
    'module.exports.jobListUrl = "' +
    entry +
    '";\n' +
    "module.exports.scrapJobList = scrapJobList;\n" +
    "module.exports.scrapeJobList = scrapJobList;\n"
  );
}

function jobsDetailTemplate(domain) {
  return (
    '"use strict";\n' +
    "\n" +
    "// BETA source (see docs/SOURCES.md): " +
    domain +
    " via the generic\n" +
    "// article reader. Validate against a live page before trusting it.\n" +
    "\n" +
    'var article = require("../../utils/article");\n' +
    "\n" +
    "function scrapJobDetail(html, url) {\n" +
    "  return article.extractArticle(html, url);\n" +
    "}\n" +
    "\n" +
    "module.exports.scrapJobDetail = scrapJobDetail;\n" +
    "module.exports.scrapeJobDetail = scrapJobDetail;\n"
  );
}

function papersListTemplate(domain, entry) {
  return (
    '"use strict";\n' +
    "\n" +
    "// BETA source (see docs/SOURCES.md): " +
    domain +
    ".\n" +
    "// Tune includePattern/minText against the live exam hub, add fixtures\n" +
    "// in test/, then register this domain in utils/sources.js.\n" +
    "\n" +
    'var harvest = require("../../utils/harvest");\n' +
    "\n" +
    "function scrapPaperList(html, pageUrl) {\n" +
    "  var links = harvest.harvestLinks(html, pageUrl, {\n" +
    "    minText: 10,\n" +
    "    maxLinks: 200,\n" +
    "  });\n" +
    "  var data = links.map(function (entry) {\n" +
    "    return { exam: entry.title, title: entry.title, link: entry.link };\n" +
    "  });\n" +
    "  return { data: data, next: null };\n" +
    "}\n" +
    "\n" +
    'module.exports.papersListUrl = "' +
    entry +
    '";\n' +
    "module.exports.scrapPaperList = scrapPaperList;\n" +
    "module.exports.scrapePaperList = scrapPaperList;\n"
  );
}

function papersDetailTemplate(domain) {
  return (
    '"use strict";\n' +
    "\n" +
    "// BETA source (see docs/SOURCES.md): " +
    domain +
    " — PDFs grouped\n" +
    "// under their nearest headings. Validate against a live page.\n" +
    "\n" +
    'var harvest = require("../../utils/harvest");\n' +
    "\n" +
    "function scrapPaperDetail(html, url) {\n" +
    "  var data = [\n" +
    "    {\n" +
    '      key: "Post Link",\n' +
    '      value: [{ text: "Link", link: url }],\n' +
    '      type: "Link",\n' +
    "    },\n" +
    "  ];\n" +
    "  var groups = harvest.harvestPdfGroups(html, url);\n" +
    "  groups.forEach(function (group) {\n" +
    "    data.push({\n" +
    '      key: group.heading || "Papers",\n' +
    "      value: group.links.map(function (entry) {\n" +
    "        return { text: entry.title, link: entry.pdfUrl };\n" +
    "      }),\n" +
    '      type: "Link",\n' +
    "    });\n" +
    "  });\n" +
    "  return data;\n" +
    "}\n" +
    "\n" +
    "module.exports.scrapPaperDetail = scrapPaperDetail;\n" +
    "module.exports.scrapePaperDetail = scrapPaperDetail;\n"
  );
}

function main() {
  var argv = process.argv.slice(2);
  if (argv.indexOf("-h") !== -1 || argv.indexOf("--help") !== -1) {
    console.error(HELP.join("\n"));
    process.exit(0);
  }
  var domain = (flagValue(argv, "--domain") || "").toLowerCase();
  var type = (flagValue(argv, "--type") || "").toLowerCase();
  var root = flagValue(argv, "--root") || path.join(__dirname, "..");

  if (!validDomain(domain)) {
    fail(
      "need --domain <bare-domain>, e.g. --domain example.com (no scheme, no www)."
    );
  }
  if (type !== "jobs" && type !== "papers") {
    fail(
      'need --type <jobs|papers> (got "' +
        (flagValue(argv, "--type") || "") +
        '").'
    );
  }
  var entry = flagValue(argv, "--entry") || "https://" + domain + "/";
  if (!/^https?:\/\//i.test(entry)) {
    fail('entry URL must use http(s): "' + entry + '".');
  }

  var stem = type === "jobs" ? "job" : "papers";
  var listName = stem + "-list.js";
  var detailName = stem + "-detail.js";
  var dir = path.join(root, "scripts", domain);
  var listPath = path.join(dir, listName);
  var detailPath = path.join(dir, detailName);
  if (fs.existsSync(listPath) || fs.existsSync(detailPath)) {
    fail(
      "scripts/" +
        domain +
        " already has a " +
        stem +
        " parser; remove it first if you really want to re-scaffold."
    );
  }

  fs.mkdirSync(dir, { recursive: true });
  var listSrc =
    type === "jobs"
      ? jobsListTemplate(domain, entry)
      : papersListTemplate(domain, entry);
  var detailSrc =
    type === "jobs" ? jobsDetailTemplate(domain) : papersDetailTemplate(domain);
  fs.writeFileSync(listPath, listSrc);
  fs.writeFileSync(detailPath, detailSrc);

  console.log("scaffolded scripts/" + domain + "/" + listName);
  console.log("scaffolded scripts/" + domain + "/" + detailName);
  console.log("");
  console.log("next steps (see CONTRIBUTING.md):");
  console.log(
    '  1. register "' + domain + '" (' + type + ", beta) in utils/sources.js"
  );
  console.log(
    "  2. tune the parser against the live site; add fixtures in test/"
  );
  console.log("  3. run: npm test && npm run lint && npm run format:check");
}

main();
