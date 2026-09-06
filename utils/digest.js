"use strict";

// Digest model: reads run-scrapper JSON output, extracts titles/deadlines,
// diffs against a state file (new-job detection + enrichment cache).

var fs = require("fs");
var crypto = require("crypto");
var calendar = require("./calendar");

var STATE_VERSION = 1;
var MAX_TEXT = 4000;

function loadJobsFile(path) {
  var raw;
  try {
    raw = fs.readFileSync(path, "utf8");
  } catch (err) {
    throw new Error('cannot read input file "' + path + '": ' + err.message);
  }
  var jobs;
  try {
    jobs = JSON.parse(raw);
  } catch (err) {
    throw new Error('input file "' + path + '" is not valid JSON.');
  }
  if (!Array.isArray(jobs)) {
    throw new Error(
      'input file "' + path + '" must be a run-scrapper JSON array.'
    );
  }
  return jobs.filter(function (job) {
    return job && !job.error && Array.isArray(job.detail);
  });
}

function blankState() {
  return { version: STATE_VERSION, jobs: {}, enrich: {}, quarantine: {} };
}

function loadState(path) {
  try {
    var raw = fs.readFileSync(path, "utf8");
    var state = JSON.parse(raw);
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      return { state: blankState(), fresh: true };
    }
    if (!state.jobs || typeof state.jobs !== "object") {
      state.jobs = {};
    }
    if (!state.enrich || typeof state.enrich !== "object") {
      state.enrich = {};
    }
    if (!state.quarantine || typeof state.quarantine !== "object") {
      state.quarantine = {};
    }
    return { state: state, fresh: false };
  } catch (err) {
    return { state: blankState(), fresh: true };
  }
}

function saveState(path, state) {
  state.version = STATE_VERSION;
  fs.writeFileSync(path, JSON.stringify(state, null, 2));
}

function recordText(record) {
  if (!record || record.value === undefined || record.value === null) {
    return "";
  }
  if (typeof record.value === "string") {
    return record.value;
  }
  if (Array.isArray(record.value)) {
    return record.value
      .map(function (item) {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          return item.text || "";
        }
        return "";
      })
      .join("; ");
  }
  return "";
}

function extractTitle(job) {
  var detail = job.detail || [];
  var i;
  for (i = 0; i < detail.length; i++) {
    if (/name of post/i.test(detail[i].key || "")) {
      var named = recordText(detail[i]).trim();
      if (named) {
        return named;
      }
    }
  }
  for (i = 0; i < detail.length; i++) {
    if (detail[i].key === "Header" && Array.isArray(detail[i].value)) {
      var header = detail[i].value.filter(Boolean).join(" — ").trim();
      if (header) {
        return header;
      }
    }
  }
  // First other keyed record. Label-style records (link boxes, tables)
  // title by their key — e.g. a UPSC exam heading above its PDF links.
  // Content-style records title by key + text (covers Title/Exam records
  // from generic article and papers parsers).
  for (i = 0; i < detail.length; i++) {
    var key = (detail[i].key || "").trim();
    if (!key || key === "Post Link" || key === "Header") {
      continue;
    }
    if (detail[i].type === "Link" || detail[i].type === "Table") {
      return key;
    }
    var text = recordText(detail[i]).trim();
    if (text) {
      return (key + ": " + text).trim();
    }
  }
  for (i = 0; i < detail.length; i++) {
    if (
      detail[i].type === "String" &&
      detail[i].key &&
      typeof detail[i].value === "string" &&
      detail[i].value.trim()
    ) {
      return (detail[i].key + ": " + detail[i].value).trim();
    }
  }
  try {
    var parsed = new URL(job.url);
    return parsed.hostname + parsed.pathname;
  } catch (err) {
    return job.url || "(untitled job)";
  }
}

function extractText(job) {
  var detail = job.detail || [];
  var chunks = [];
  detail.forEach(function (record) {
    if (
      record.type === "String" ||
      record.type === "List" ||
      record.type === "Paragraph"
    ) {
      var text = recordText(record).trim();
      if (text) {
        chunks.push((record.key ? record.key + ": " : "") + text);
      }
    }
  });
  return chunks.join("\n").slice(0, MAX_TEXT);
}

function extractDeadline(job) {
  var detail = job.detail || [];
  for (var i = 0; i < detail.length; i++) {
    if (/last date|closing date/i.test(detail[i].key || "")) {
      var raw = recordText(detail[i]).trim().split("\n")[0];
      if (raw) {
        return { raw: raw, parsed: calendar.parseDeadline(raw) };
      }
    }
  }
  return null;
}

function extractPincodes(text) {
  var found = [];
  var seen = {};
  var pattern = /(?:^|\D)([1-9]\d{5})(?!\d)/g;
  var match;
  var haystack = String(text || "");
  while ((match = pattern.exec(haystack)) !== null) {
    if (!seen[match[1]]) {
      seen[match[1]] = true;
      found.push(match[1]);
    }
  }
  return found;
}

function hash(text) {
  return crypto
    .createHash("sha256")
    .update(String(text), "utf8")
    .digest("hex")
    .slice(0, 12);
}

// Splits jobs into fresh (never seen) vs known, stamping lastSeen.
// Returns { fresh, state }; the returned state includes the new stamps.
function diffJobs(jobs, state) {
  var now = new Date().toISOString();
  var fresh = [];
  jobs.forEach(function (job) {
    var known = state.jobs[job.url];
    if (known) {
      known.lastSeen = now;
    } else {
      state.jobs[job.url] = {
        firstSeen: now,
        lastSeen: now,
        title: extractTitle(job),
      };
      fresh.push(job);
    }
  });
  return { fresh: fresh, state: state };
}

function cacheGet(state, key) {
  if (!state.enrich || !(key in state.enrich)) {
    return undefined;
  }
  return state.enrich[key];
}

function cacheSet(state, key, value) {
  if (!state.enrich) {
    state.enrich = {};
  }
  state.enrich[key] = value;
}

module.exports.loadJobsFile = loadJobsFile;
module.exports.blankState = blankState;
module.exports.loadState = loadState;
module.exports.saveState = saveState;
module.exports.extractTitle = extractTitle;
module.exports.extractText = extractText;
module.exports.extractDeadline = extractDeadline;
module.exports.extractPincodes = extractPincodes;
module.exports.diffJobs = diffJobs;
module.exports.cacheGet = cacheGet;
module.exports.cacheSet = cacheSet;
module.exports.hash = hash;
