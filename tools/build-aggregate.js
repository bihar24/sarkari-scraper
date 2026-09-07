#!/usr/bin/env node
"use strict";

// Builds data/jobs-all.json or data/papers-all.json only from source
// snapshots that validate. It refuses to overwrite a previously non-empty
// aggregate with [] when every current source attempt produced nothing.

var fs = require("node:fs");
var path = require("node:path");
var imports = require("../catalog/importers");

function readFile(file, kind, stamp) {
  try {
    var group = imports.importScrapedFile(file, {
      kind: kind,
      fetchedAt: stamp,
      collection: path.basename(file),
      label: path.basename(file),
    });
    return { ok: true, records: group.records, warnings: group.warnings || [] };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function main(argv) {
  var data = null;
  var kind = null;
  var output = null;
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--data" && argv[i + 1]) data = argv[++i];
    else if (argv[i] === "--kind" && argv[i + 1]) kind = argv[++i];
    else if (argv[i] === "--output" && argv[i + 1]) output = argv[++i];
  }
  if (!data || !kind || !output) {
    console.error(
      "usage: node tools/build-aggregate.js --data <dir> --kind job|paper --output <file>"
    );
    process.exit(2);
  }
  if (kind !== "job" && kind !== "paper") {
    console.error("--kind must be job or paper");
    process.exit(2);
  }
  var prefix = kind === "job" ? "jobs-" : "papers-";
  var files = fs
    .readdirSync(data)
    .filter(function (name) {
      return new RegExp("^" + prefix + "[a-z0-9.-]+\\.json$").test(name);
    })
    .sort();
  var stamp = new Date().toISOString();
  var merged = [];
  var seen = {};
  var warnings = [];
  files.forEach(function (name) {
    var file = path.join(data, name);
    var parsed = readFile(file, kind, stamp);
    if (!parsed.ok) {
      warnings.push(name + ": " + parsed.error);
      return;
    }
    if (!parsed.records.length) {
      warnings.push(name + ": no usable records");
      return;
    }
    parsed.records.forEach(function (record) {
      var key = record.url || record.link;
      if (seen[key]) return;
      seen[key] = true;
      merged.push(record);
    });
  });

  if (merged.length === 0) {
    var prior = fs.existsSync(output)
      ? JSON.parse(fs.readFileSync(output, "utf8"))
      : [];
    if (Array.isArray(prior) && prior.length > 0) {
      console.error(
        "Refusing to replace a previously non-empty " +
          kind +
          " aggregate with []; previous data retained."
      );
      process.exit(1);
    }
    fs.writeFileSync(output, "[]\n");
    console.error(
      "No usable " + kind + " records; wrote empty aggregate for a clean slate."
    );
    process.exit(1);
  }

  fs.writeFileSync(output, JSON.stringify(merged, null, 2) + "\n");
  console.log(
    JSON.stringify({
      ok: true,
      kind: kind,
      sources: files.length,
      records: merged.length,
      warnings: warnings,
    })
  );
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main: main };
