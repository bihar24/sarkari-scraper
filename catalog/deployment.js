"use strict";

// Builds the read-only deployment snapshot from files already committed under
// data/. It deliberately performs no network requests and no writes, making it
// safe to run once during a Vercel cold start.
var fs = require("node:fs");
var path = require("node:path");
var store = require("./store");
var importers = require("./importers");

function readRunTimestamp(dataDirectory) {
  var runFile = path.join(dataDirectory, "lastrun.json");
  try {
    var value = JSON.parse(fs.readFileSync(runFile, "utf8"));
    if (value && !Number.isNaN(Date.parse(value.at))) {
      return new Date(value.at).toISOString();
    }
  } catch (error) {
    // A missing/malformed run marker must not stop the last committed data
    // from being served. The file's mtime is a deterministic local fallback.
  }
  try {
    return fs.statSync(dataDirectory).mtime.toISOString();
  } catch (error) {
    return new Date(0).toISOString();
  }
}

function deploymentCatalogue(dataDirectory) {
  dataDirectory = path.resolve(dataDirectory);
  var prebuilt = path.join(dataDirectory, "catalog.json");
  if (fs.existsSync(prebuilt)) return store.load(prebuilt);

  var catalogue = store.empty();
  var stamp = readRunTimestamp(dataDirectory);
  var files = [];
  var allJobs = path.join(dataDirectory, "jobs-all.json");

  if (fs.existsSync(allJobs)) {
    files.push({ file: allJobs, kind: "job", label: "All job sources" });
  } else if (fs.existsSync(dataDirectory)) {
    fs.readdirSync(dataDirectory)
      .filter(function (name) {
        return /^jobs-[a-z0-9.-]+\.json$/.test(name);
      })
      .sort()
      .forEach(function (name) {
        files.push({
          file: path.join(dataDirectory, name),
          kind: "job",
          label: "Jobs · " + name.slice(5, -5),
        });
      });
  }

  if (fs.existsSync(dataDirectory)) {
    fs.readdirSync(dataDirectory)
      .filter(function (name) {
        return /^papers-[a-z0-9.-]+\.json$/.test(name);
      })
      .sort()
      .forEach(function (name) {
        files.push({
          file: path.join(dataDirectory, name),
          kind: "paper",
          label: "Exam papers · " + name.slice(7, -5),
        });
      });
  }

  files.forEach(function (entry) {
    var name = path.basename(entry.file);
    var group;
    try {
      group = importers.importScrapedFile(entry.file, {
        kind: entry.kind,
        fetchedAt: stamp,
        collection: name,
        label: entry.label,
      });
    } catch (error) {
      group = {
        key: entry.kind + ":" + name,
        label: entry.label,
        error: "Committed deployment data is unreadable.",
      };
    }
    store.applyGroup(catalogue, group, stamp);
  });

  // lastrun.json records the latest attempted sweep, including an empty or
  // partially failed one. Individual source status still explains whether any
  // records were usable.
  if (fs.existsSync(path.join(dataDirectory, "lastrun.json"))) {
    catalogue.updatedAt = stamp;
  }
  return store.validate(catalogue);
}

module.exports = {
  deploymentCatalogue: deploymentCatalogue,
  readRunTimestamp: readRunTimestamp,
};
