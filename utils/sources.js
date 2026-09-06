"use strict";

// Source registry: the single source of truth for which (domain ×
// content-type) pairs this project can scrape.
//
// Statuses:
//   "stable" - long-standing parser, widely used.
//   "beta"   - fixture-tested parser that still needs live validation
//              (see CONTRIBUTING.md "validating a beta source").
//
// To add a source: scaffold it with `npm run new-source`, implement the
// parser, then register it here. Anything not registered here is rejected
// by the CLIs with a helpful error.

var SOURCES = {
  "sarkariresult.com": {
    jobs: { status: "stable", notes: "" },
    papers: null,
  },
  "sarkariexam.com": {
    jobs: { status: "stable", notes: "" },
    papers: null,
  },
  "sarkariresults.info": {
    jobs: { status: "stable", notes: "" },
    papers: null,
  },
  "freshersnow.com": {
    jobs: { status: "stable", notes: "" },
    papers: null,
  },
  "freejobalert.com": {
    jobs: {
      status: "beta",
      notes:
        "Content-driven /articles/ link extraction; detail via generic article reader.",
    },
    papers: null,
  },
  "employmentnews.gov.in": {
    jobs: {
      status: "beta",
      notes: "Official weekly journal; generic harvest, needs live validation.",
    },
    papers: null,
  },
  "rojgarresult.com": {
    jobs: {
      status: "beta",
      notes: "Generic harvest, needs live validation.",
    },
    papers: null,
  },
  "upsc.gov.in": {
    jobs: null,
    papers: {
      status: "beta",
      notes:
        "Official PYQ PDFs grouped by exam; page may be bot-guarded, validate live.",
    },
  },
  "adda247.com": {
    jobs: null,
    papers: {
      status: "beta",
      notes: "Exam-hub tables plus shift-wise EN/HI PDF tables.",
    },
  },
};

var TYPES = ["jobs", "papers"];

function fileFor(type, kind) {
  // jobs -> job-list/job-detail, papers -> papers-list/papers-detail
  var stem = type === "jobs" ? "job" : "papers";
  return stem + "-" + kind;
}

function isSupported(domain, type) {
  return Boolean(domain && SOURCES[domain] && SOURCES[domain][type]);
}

function domainsFor(type) {
  return Object.keys(SOURCES).filter(function (domain) {
    return isSupported(domain, type);
  });
}

function jobDomains() {
  return domainsFor("jobs");
}

function paperDomains() {
  return domainsFor("papers");
}

function statusOf(domain, type) {
  if (!isSupported(domain, type)) {
    return null;
  }
  return SOURCES[domain][type].status;
}

function supportedList(type) {
  return domainsFor(type).join(", ");
}

function requireParser(domain, type, kind) {
  if (!isSupported(domain, type)) {
    throw new Error(
      'Domain "' +
        domain +
        '" is not supported for ' +
        type +
        ". Supported: " +
        (supportedList(type) || "(none)") +
        "."
    );
  }
  return require("../scripts/" + domain + "/" + fileFor(type, kind));
}

function requireListParser(domain, type) {
  return requireParser(domain, type, "list");
}

function requireDetailParser(domain, type) {
  return requireParser(domain, type, "detail");
}

function catalogRows() {
  return Object.keys(SOURCES).map(function (domain) {
    var entry = SOURCES[domain];
    var notes = [];
    if (entry.jobs && entry.jobs.notes) {
      notes.push("jobs: " + entry.jobs.notes);
    }
    if (entry.papers && entry.papers.notes) {
      notes.push("papers: " + entry.papers.notes);
    }
    return {
      domain: domain,
      jobs: entry.jobs ? entry.jobs.status : null,
      papers: entry.papers ? entry.papers.status : null,
      notes: notes.join(" "),
    };
  });
}

function formatCatalog() {
  var lines = [
    "Supported sources (status: stable | beta = needs live validation):",
    "",
  ];
  catalogRows().forEach(function (row) {
    lines.push(
      "  " +
        row.domain +
        "\n    jobs: " +
        (row.jobs || "-") +
        " | papers: " +
        (row.papers || "-") +
        (row.notes ? "\n    " + row.notes : "")
    );
  });
  lines.push("", "See docs/SOURCES.md for details and the wanted list.");
  return lines.join("\n");
}

module.exports.SOURCES = SOURCES;
module.exports.TYPES = TYPES;
module.exports.isSupported = isSupported;
module.exports.jobDomains = jobDomains;
module.exports.paperDomains = paperDomains;
module.exports.statusOf = statusOf;
module.exports.requireListParser = requireListParser;
module.exports.requireDetailParser = requireDetailParser;
module.exports.catalogRows = catalogRows;
module.exports.formatCatalog = formatCatalog;
