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

function readRunStatus(dataDirectory) {
  var file = path.join(dataDirectory, "run-status.json");
  try {
    var value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (value && Array.isArray(value.sources)) return value.sources;
  } catch (error) {
    // Missing/unreadable status is non-fatal; the committed catalogue still
    // explains its own source health.
  }
  return [];
}

function applyRunStatus(catalogue, sources) {
  sources.forEach(function (entry) {
    if (!entry || typeof entry.domain !== "string") return;
    var key = "scrape:" + entry.type + ":" + entry.domain;
    var prior = catalogue.sources[key] || {};
    catalogue.sources[key] = {
      label: prior.label || entry.domain + " (" + entry.type + ")",
      status: entry.status || "failed",
      lastAttempt: entry.lastAttempt || prior.lastAttempt || null,
      lastSuccess:
        entry.status === "ok"
          ? entry.lastAttempt || prior.lastSuccess || null
          : prior.lastSuccess || null,
      count: prior.count || 0,
      error:
        entry.status === "ok"
          ? prior.error || null
          : entry.error ||
            prior.error ||
            "This source produced no usable snapshot; previous data retained.",
    };
  });
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
  applyRunStatus(catalogue, readRunStatus(dataDirectory));
  if (fs.existsSync(path.join(dataDirectory, "lastrun.json"))) {
    catalogue.updatedAt = stamp;
  }
  return store.validate(catalogue);
}

module.exports = {
  deploymentCatalogue: deploymentCatalogue,
  readRunTimestamp: readRunTimestamp,
  readRunStatus: readRunStatus,
  applyRunStatus: applyRunStatus,
};
