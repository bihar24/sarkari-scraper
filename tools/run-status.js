#!/usr/bin/env node
"use strict";

// Writes data/run-status.json and data/lastrun.json. The status file records
// the latest attempt per source separately from the last successful import,
// which is stored in data/catalog.json sources by catalog/build-catalog.

var fs = require("node:fs");
var path = require("node:path");

function readStatus(file, type, attemptedAt) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean)
    .map(function (line) {
      var parts = line.split(/\s+/);
      var domain = parts[0];
      var ok = parts[1] === "1";
      return {
        domain: domain,
        type: type,
        status: ok ? "ok" : "failed",
        lastAttempt: attemptedAt,
        lastSuccess: null,
      };
    });
}

function main(argv) {
  var jobsFile = null;
  var papersFile = null;
  var out = "data/run-status.json";
  var lastrun = "data/lastrun.json";
  var at = new Date().toISOString();
  var trigger = "";
  var reason = "";
  var domains = [];
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--jobs" && argv[i + 1]) jobsFile = argv[++i];
    else if (argv[i] === "--papers" && argv[i + 1]) papersFile = argv[++i];
    else if (argv[i] === "--out" && argv[i + 1]) out = argv[++i];
    else if (argv[i] === "--lastrun" && argv[i + 1]) lastrun = argv[++i];
    else if (argv[i] === "--at" && argv[i + 1]) at = argv[++i];
    else if (argv[i] === "--trigger" && argv[i + 1]) trigger = argv[++i];
    else if (argv[i] === "--reason" && argv[i + 1]) reason = argv[++i];
    else if (argv[i] === "--domains" && argv[i + 1])
      domains = String(argv[++i]).trim().split(/\s+/).filter(Boolean);
    else if (argv[i] === "--domain" && argv[i + 1]) domains.push(argv[++i]);
  }
  var sources = readStatus(jobsFile, "jobs", at).concat(
    readStatus(papersFile, "papers", at)
  );
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ version: 1, attemptedAt: at, sources: sources }, null, 2) +
      "\n"
  );
  fs.mkdirSync(path.dirname(path.resolve(lastrun)), { recursive: true });
  fs.writeFileSync(
    lastrun,
    JSON.stringify(
      {
        at: at,
        trigger: trigger,
        reason: reason,
        domains: domains,
        attempted: sources.length,
        ok: sources.filter(function (s) {
          return s.status === "ok";
        }).length,
        failed: sources.filter(function (s) {
          return s.status === "failed";
        }).length,
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    JSON.stringify({
      ok: true,
      attempted: sources.length,
      ok: sources.filter(function (s) {
        return s.status === "ok";
      }).length,
      failed: sources.filter(function (s) {
        return s.status === "failed";
      }).length,
      runStatus: out,
      lastrun: lastrun,
    })
  );
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { main: main, readStatus: readStatus };
