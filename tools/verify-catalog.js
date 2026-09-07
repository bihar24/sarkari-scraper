#!/usr/bin/env node
"use strict";

// Pre-commit verification for the deployment catalogue. Fails when the
// catalogue is empty or a required kind (jobs, schemes, policies) has no
// usable records; papers remain optional/beta and are reported as warnings.

var path = require("node:path");
var store = require("../catalog/store");

function main(argv) {
  var file = "data/catalog.json";
  var required = ["job", "scheme", "policy"];
  var optional = ["paper"];
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--store" && argv[i + 1]) file = argv[++i];
    else if (argv[i] === "--require" && argv[i + 1])
      required = argv[++i].split(",");
    else if (argv[i] === "--warn" && argv[i + 1])
      optional = argv[++i].split(",");
  }
  var catalogue;
  try {
    catalogue = store.load(path.resolve(file));
  } catch (error) {
    console.error("Deployment catalogue is unavailable: " + error.message);
    process.exit(1);
  }
  var counts = { total: catalogue.records.length };
  catalogue.records.forEach(function (record) {
    counts[record.kind] = (counts[record.kind] || 0) + 1;
  });
  var warnings = [];
  var failures = [];

  required.forEach(function (kind) {
    if (!counts[kind]) {
      failures.push(kind + " records are missing");
    }
  });
  optional.forEach(function (kind) {
    if (!counts[kind]) {
      warnings.push(kind + " records are missing (beta, not fatal)");
    }
  });

  var result = {
    ok: failures.length === 0 && counts.total > 0,
    store: file,
    counts: counts,
    sources: Object.keys(catalogue.sources).map(function (key) {
      var source = catalogue.sources[key];
      return {
        id: key,
        label: source.label,
        status: source.status,
        lastAttempt: source.lastAttempt,
        lastSuccess: source.lastSuccess,
        count: source.count || 0,
        error: source.error,
      };
    }),
    failures: failures,
    warnings: warnings,
  };
  console.log(JSON.stringify(result, null, 2));
  warnings.forEach(function (warning) {
    console.error("::warning::" + warning);
  });
  failures.forEach(function (failure) {
    console.error("::error::" + failure);
  });
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main: main };
