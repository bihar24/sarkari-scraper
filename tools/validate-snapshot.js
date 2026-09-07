#!/usr/bin/env node
"use strict";

// Validation gate for staged scraper output. A snapshot is only acceptable
// when it is valid JSON, an array, has at least one normalizable record, and
// every accepted record passes catalogue normalization (so it will be visible
// through the deployment API). Run this before replacing a committed source
// file; the tool never writes a source file.

var fs = require("node:fs");
var path = require("node:path");
var imports = require("../catalog/importers");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main(argv) {
  var input = null;
  var kind = null;
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && argv[i + 1]) input = argv[++i];
    else if (argv[i] === "--kind" && argv[i + 1]) kind = argv[++i];
  }
  if (!input)
    fail(
      "usage: node tools/validate-snapshot.js --input <file> --kind job|paper"
    );
  if (kind !== "job" && kind !== "paper")
    fail("usage: --kind must be job or paper");
  var file = path.resolve(input);
  if (!fs.existsSync(file)) fail("Snapshot missing: " + file);
  var raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail("Snapshot is not valid JSON: " + file);
  }
  if (!Array.isArray(raw)) fail("Snapshot is not an array: " + file);
  if (raw.length === 0) fail("Snapshot is empty: " + file);

  var group;
  try {
    group = imports.importScrapedFile(file, {
      kind: kind,
      fetchedAt: new Date().toISOString(),
      collection: path.basename(file),
      label: path.basename(file),
    });
  } catch (error) {
    fail("Snapshot cannot be normalized: " + error.message);
  }
  if (!group.records || group.records.length === 0) {
    var detail =
      group.warnings && group.warnings.length
        ? " " + group.warnings.slice(0, 5).join("; ")
        : "";
    fail(
      "Snapshot has no usable " +
        (kind === "job" ? "job" : "paper") +
        " records" +
        detail
    );
  }
  console.log(
    JSON.stringify({
      ok: true,
      file: path.basename(file),
      kind: kind,
      usableRecords: group.records.length,
      warnings: group.warnings || [],
    })
  );
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main: main };
