#!/usr/bin/env node
"use strict";

// Builds the intentional deployment snapshot data/catalog.json from the
// committed/validated automation outputs plus (optionally) the pinned Bihar
// scheme tracker. Runs only in CI/build workflows, never in the Vercel
// request handler. Failed imports retain previous valid catalogue data.

var path = require("node:path");
var store = require("../catalog/store");
var imports = require("../catalog/importers");
var http = require("../utils/http");
var runtime = require("../utils/runtime");

async function main(argv) {
  var storeFile = "data/catalog.json";
  var dataDir = "data";
  var trackerGithub = false;
  var trackerDir = null;
  var trackerRef = null;
  var trackerFetchedAt = new Date().toISOString();
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--store" && argv[i + 1]) storeFile = argv[++i];
    else if (argv[i] === "--data" && argv[i + 1]) dataDir = argv[++i];
    else if (argv[i] === "--tracker-github") trackerGithub = true;
    else if (argv[i] === "--tracker-dir" && argv[i + 1]) trackerDir = argv[++i];
    else if (argv[i] === "--tracker-ref" && argv[i + 1]) trackerRef = argv[++i];
  }
  if (trackerGithub && trackerDir) {
    console.error("Use either --tracker-github or --tracker-dir, not both");
    process.exit(2);
  }
  if (
    (trackerGithub || trackerDir) &&
    trackerRef &&
    !/^[a-f0-9]{40}$/.test(trackerRef)
  ) {
    console.error("--tracker-ref must be a full 40-character commit SHA");
    process.exit(2);
  }

  var values = {
    quiet: true,
    verbose: false,
    timeoutMs: 30000,
    retries: 2,
    retryDelayMs: 500,
    proxyUrl: null,
    ignoreRobots: false,
    allowExternal: false,
  };
  var rt = runtime.createRuntime(values);
  var stamp = trackerFetchedAt;
  var groups = [];
  var warnings = [];

  function addGroup(group) {
    if (group.error || group.partial) {
      var message = group.error || (group.warnings || []).join("; ");
      warnings.push(group.label + ": " + message);
    }
    groups.push(group);
  }

  fsFiles(dataDir)
    .filter(function (name) {
      return /^jobs-[a-z0-9.-]+\.json$/.test(name) && name !== "jobs-all.json";
    })
    .sort()
    .forEach(function (name) {
      try {
        addGroup(
          imports.importScrapedFile(path.join(dataDir, name), {
            kind: "job",
            fetchedAt: stamp,
            collection: name,
            label: "Jobs · " + name.slice(5, -5),
          })
        );
      } catch (error) {
        addGroup({
          key: "job:" + name,
          label: "Jobs · " + name.slice(5, -5),
          error: http.describeError(error),
        });
      }
    });

  fsFiles(dataDir)
    .filter(function (name) {
      return (
        /^papers-[a-z0-9.-]+\.json$/.test(name) && name !== "papers-all.json"
      );
    })
    .sort()
    .forEach(function (name) {
      try {
        addGroup(
          imports.importScrapedFile(path.join(dataDir, name), {
            kind: "paper",
            fetchedAt: stamp,
            collection: name,
            label: "Exam papers · " + name.slice(7, -5),
          })
        );
      } catch (error) {
        addGroup({
          key: "paper:" + name,
          label: "Exam papers · " + name.slice(7, -5),
          error: http.describeError(error),
        });
      }
    });

  if (trackerGithub || trackerDir) {
    try {
      var trackerGroups = trackerDir
        ? imports.importTrackerDirectory(trackerDir, {
            revision: trackerRef || imports.TRACKER_REF,
            fetchedAt: stamp,
          })
        : await imports.importTrackerGithub(rt.client, {
            revision: trackerRef,
            token: process.env.GITHUB_TOKEN,
            fetchedAt: stamp,
          });
      trackerGroups.forEach(addGroup);
    } catch (error) {
      ["schemes", "policies"].forEach(function (plural) {
        addGroup({
          key: "tracker:" + plural,
          label: "Bihar " + plural,
          error: http.describeError(error),
        });
      });
    }
  }

  var saved = store.update(path.resolve(storeFile), function (catalogue) {
    groups.forEach(function (group) {
      store.applyGroup(catalogue, group, stamp);
    });
    return catalogue;
  });

  var kinds = {};
  saved.records.forEach(function (record) {
    kinds[record.kind] = (kinds[record.kind] || 0) + 1;
  });
  var result = {
    ok: saved.records.length > 0,
    store: storeFile,
    total: saved.records.length,
    kinds: kinds,
    sources: saved.sources,
    warnings: warnings,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(saved.records.length > 0 ? 0 : 1);
}

function fsFiles(dir) {
  var fs = require("node:fs");
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(function (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}

module.exports = { main: main };
