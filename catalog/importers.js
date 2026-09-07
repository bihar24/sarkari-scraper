"use strict";

// Original adapters. We read upstream DATA, never run its scripts, migrations
// or application. Imported CC BY-SA material retains a separate licence.
var fs = require("node:fs");
var path = require("node:path");
var YAML = require("yaml");
var model = require("./model");
var domains = require("./domains");
var pool = require("../utils/pool");
var http = require("../utils/http");

var TRACKER_REF = "32b041f52a87f51e2c3d229bcc77e71518eff70c";
var API_ROOT = "https://api.github.com/repos/fossdot/bihar-scheme-tracker";
var MAX_FILES = 500;

function readText(file) {
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 20 * 1024 * 1024)
    throw new Error("Input must be a file smaller than 20 MB.");
  return fs.readFileSync(file, "utf8");
}

function parseYaml(contents) {
  if (Buffer.byteLength(contents) > 1024 * 1024)
    throw new Error("YAML record exceeds 1 MB.");
  var document = YAML.parseDocument(contents, {
    uniqueKeys: true,
    schema: "core",
  });
  if (document.errors.length || document.warnings.length)
    throw new Error("Invalid or unsupported YAML record.");
  return document.toJS({ maxAliasCount: 0 });
}

function trackerGroup(kind, files, options) {
  var plural = kind === "scheme" ? "schemes" : "policies";
  var warnings = [];
  var records = [];
  files.forEach(function (file) {
    try {
      if (file.error) throw new Error(file.error);
      records.push(
        model.normalizeTracker(parseYaml(file.text), {
          kind: kind,
          slug: path.basename(file.path).replace(/\.ya?ml$/, ""),
          revision: options.revision || null,
          fetchedAt: options.fetchedAt,
          recordUrl:
            model.TRACKER_REPO +
            "/blob/" +
            (options.revision || "main") +
            "/" +
            file.path,
        })
      );
    } catch (error) {
      warnings.push(path.basename(file.path) + ": " + error.message);
    }
  });
  var result = {
    key: "tracker:" + plural,
    label: "Bihar " + plural,
    origin: model.TRACKER_REPO,
    revision: options.revision || null,
    license: "CC-BY-SA-4.0",
    attribution: model.TRACKER_CREDIT + " — https://yojana.bodhya.net",
    records: records,
    replace: true,
    warnings: warnings,
  };
  // Snapshot imports are all-or-nothing per collection, not a silently
  // incomplete catalogue if one YAML file was unavailable or malformed.
  if (warnings.length || !records.length)
    result.error =
      warnings.join("; ").slice(0, 1500) ||
      "No valid " + plural + " in snapshot; previous data retained.";
  return result;
}

function importTrackerDirectory(root, options) {
  options = options || {};
  return ["scheme", "policy"].map(function (kind) {
    var plural = kind === "scheme" ? "schemes" : "policies";
    var dir = path.join(root, "data", plural);
    var files = [];
    if (fs.existsSync(dir)) {
      var names = fs
        .readdirSync(dir)
        .filter(function (name) {
          return /^[a-z0-9-]+\.ya?ml$/.test(name);
        })
        .sort();
      if (names.length > MAX_FILES)
        throw new Error("Tracker directory exceeds " + MAX_FILES + " files.");
      names.forEach(function (name) {
        var item = { path: "data/" + plural + "/" + name };
        try {
          item.text = readText(path.join(dir, name));
        } catch (error) {
          item.error = error.message;
        }
        files.push(item);
      });
    }
    return trackerGroup(kind, files, options);
  });
}

async function importTrackerGithub(client, options) {
  options = options || {};
  var revision = options.revision || TRACKER_REF;
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw new Error(
      "Use a full 40-character Git commit SHA for a reproducible tracker import."
    );
  var headers = { Accept: "application/vnd.github+json" };
  if (options.token) headers.Authorization = "Bearer " + options.token;
  var base = options.baseUrl || API_ROOT;
  // No arbitrary file URLs from the tree are fetched. Only GitHub's fixed
  // tree/blob endpoints, with locally validated SHA/path, are ever requested.
  var response = await client.get(
    base + "/git/trees/" + revision + "?recursive=1",
    { headers: headers, maxRedirects: 0 }
  );
  var tree = response.data;
  if (!tree || tree.truncated || !Array.isArray(tree.tree))
    throw new Error("GitHub returned an incomplete or malformed tree.");
  var files = tree.tree.filter(function (file) {
    return (
      file.type === "blob" &&
      file.mode === "100644" &&
      /^data\/(schemes|policies)\/[a-z0-9-]+\.ya?ml$/.test(file.path)
    );
  });
  if (!files.length || files.length > MAX_FILES)
    throw new Error(
      "Unexpected tracker catalogue size; previous data retained."
    );
  var results = await pool.runPool(
    files,
    async function (file) {
      if (!/^[a-f0-9]{40}$/.test(file.sha) || file.size > 1024 * 1024)
        throw new Error("Unsafe or oversized GitHub blob.");
      var fetched = await client.get(base + "/git/blobs/" + file.sha, {
        headers: headers,
        maxRedirects: 0,
        maxContentLength: 2 * 1024 * 1024,
      });
      if (
        !fetched.data ||
        fetched.data.encoding !== "base64" ||
        typeof fetched.data.content !== "string"
      )
        throw new Error("Invalid GitHub blob response.");
      return {
        path: file.path,
        text: Buffer.from(fetched.data.content, "base64").toString("utf8"),
      };
    },
    {
      concurrency: 2,
      delayMs: options.delayMs === undefined ? 150 : options.delayMs,
    }
  );
  var entries = results.map(function (entry, i) {
    return entry.ok
      ? entry.value
      : { path: files[i].path, error: http.describeError(entry.error) };
  });
  return ["scheme", "policy"].map(function (kind) {
    var prefix = "data/" + (kind === "scheme" ? "schemes" : "policies") + "/";
    return trackerGroup(
      kind,
      entries.filter(function (file) {
        return file.path.startsWith(prefix);
      }),
      { revision: revision, fetchedAt: options.fetchedAt }
    );
  });
}

function importScrapedFile(file, options) {
  options = options || {};
  var raw = JSON.parse(readText(file));
  if (!Array.isArray(raw) || raw.length > 10000)
    throw new Error("Expected a scraped JSON array of at most 10,000 records.");
  var kind = options.kind || "job";
  var warnings = [];
  var records = [];
  raw.forEach(function (record, i) {
    try {
      records.push(
        model.normalizeScraped(record, {
          kind: kind,
          fetchedAt: options.fetchedAt,
        })
      );
    } catch (error) {
      warnings.push("Record " + (i + 1) + ": " + error.message);
    }
  });
  var result = {
    key: kind + ":" + (options.collection || path.basename(file)),
    label:
      options.label ||
      (kind === "paper" ? "Question papers" : "Job listings") +
        " · " +
        path.basename(file),
    records: records,
    warnings: warnings,
    partial: warnings.length > 0,
    replace: false,
  };
  if (!records.length)
    result.error =
      "No usable records; previous data retained. " +
      warnings.join("; ").slice(0, 500);
  return result;
}

function importDomainFile(file, options) {
  options = options || {};
  var parsed = domains.parseDirectory(readText(file));
  return Object.assign(parsed, {
    sourceUrl: model.url(options.sourceUrl) || null,
    revision: options.revision || null,
    importedAt: options.fetchedAt || new Date().toISOString(),
    license: null,
    notice:
      "Historical discovery data only. No ownership verification, live validation, or crawl permission. No explicit gist licence was found; review rights before redistribution.",
  });
}

module.exports = {
  TRACKER_REF: TRACKER_REF,
  parseYaml: parseYaml,
  importTrackerDirectory: importTrackerDirectory,
  importTrackerGithub: importTrackerGithub,
  importScrapedFile: importScrapedFile,
  importDomainFile: importDomainFile,
};
