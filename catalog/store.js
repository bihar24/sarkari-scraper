"use strict";

var fs = require("node:fs");
var path = require("node:path");
var model = require("./model");

var MAX_BYTES = 40 * 1024 * 1024;
var MAX_RECORDS = 10000;

function empty() {
  return {
    schemaVersion: model.VERSION,
    updatedAt: null,
    demo: false,
    records: [],
    sources: {},
    changes: [],
    directory: null,
  };
}

function bilingual(value) {
  return (
    value &&
    typeof value === "object" &&
    (value.en === null || typeof value.en === "string") &&
    (value.hi === null || typeof value.hi === "string")
  );
}

function validRecord(record) {
  if (
    !record ||
    record.schemaVersion !== 1 ||
    typeof record.id !== "string" ||
    !record.id ||
    model.KINDS.indexOf(record.kind) === -1 ||
    !bilingual(record.title) ||
    !record.title.en ||
    !bilingual(record.summary) ||
    !bilingual(record.benefits) ||
    !bilingual(record.department) ||
    !Array.isArray(record.categories) ||
    !record.categories.every(function (c) {
      return typeof c === "string";
    }) ||
    !model.url(record.url) ||
    (record.applyUrl !== null && !model.url(record.applyUrl)) ||
    !record.source ||
    !model.url(record.source.url) ||
    !model.url(record.source.recordUrl) ||
    typeof record.source.provider !== "string" ||
    Number.isNaN(Date.parse(record.source.fetchedAt)) ||
    (record.source.lastVerified !== null &&
      !model.date(record.source.lastVerified)) ||
    !Array.isArray(record.links) ||
    !record.links.every(function (link) {
      return link && typeof link.label === "string" && model.url(link.url);
    }) ||
    !record.original ||
    typeof record.original !== "object" ||
    Array.isArray(record.original)
  )
    return false;
  if (
    record.deadline &&
    (!record.deadline.purpose ||
      (record.deadline.date !== null && !model.date(record.deadline.date)))
  )
    return false;
  if (
    record.eligibility &&
    (!bilingual(record.eligibility.text) ||
      !Array.isArray(record.eligibility.personas))
  )
    return false;
  return true;
}

function validate(value) {
  if (
    !value ||
    value.schemaVersion !== model.VERSION ||
    !Array.isArray(value.records) ||
    value.records.length > MAX_RECORDS ||
    !value.sources ||
    typeof value.sources !== "object" ||
    Array.isArray(value.sources) ||
    !Array.isArray(value.changes)
  ) {
    throw new Error(
      "Unsupported or malformed catalogue; refusing to replace data."
    );
  }
  if (
    value.directory &&
    (!Array.isArray(value.directory.domains) ||
      value.directory.domains.length > 30000 ||
      !value.directory.domains.every(function (host) {
        return typeof host === "string";
      }))
  ) {
    throw new Error("Malformed or oversized domain directory.");
  }
  var seen = new Set();
  value.records.forEach(function (record) {
    if (!validRecord(record) || seen.has(record.id)) {
      throw new Error("Invalid or duplicate catalogue record.");
    }
    seen.add(record.id);
  });
  return value;
}

function load(file) {
  if (!fs.existsSync(file)) return empty();
  if (fs.statSync(file).size > MAX_BYTES)
    throw new Error("Catalogue exceeds 40 MB.");
  return validate(JSON.parse(fs.readFileSync(file, "utf8")));
}

function atomicWrite(file, value) {
  var bytes = JSON.stringify(value, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > MAX_BYTES)
    throw new Error("Catalogue exceeds 40 MB.");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  var temporary =
    file +
    "." +
    process.pid +
    "." +
    require("node:crypto").randomBytes(6).toString("hex") +
    ".tmp";
  try {
    fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function update(file, mutate) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  var lock = file + ".lock";
  var fd;
  try {
    fd = fs.openSync(lock, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "Catalogue is locked by another import. Retry later; see docs/PRODUCT.md for stale-lock recovery."
      );
    throw error;
  }
  try {
    fs.writeSync(fd, String(process.pid));
    var value = mutate(load(file));
    validate(value);
    atomicWrite(file, value);
    return value;
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}

function applyGroup(catalogue, group, now) {
  var stamp = now || new Date().toISOString();
  if (
    !group ||
    typeof group.key !== "string" ||
    !group.key ||
    group.key.length > 500 ||
    ["__proto__", "constructor", "prototype"].indexOf(group.key) !== -1
  ) {
    throw new Error("Invalid collection key.");
  }
  var prior = Object.prototype.hasOwnProperty.call(catalogue.sources, group.key)
    ? catalogue.sources[group.key]
    : {};
  if (group.error) {
    catalogue.sources[group.key] = Object.assign({}, prior, {
      label: group.label || prior.label || group.key,
      lastAttempt: stamp,
      status: "error",
      error: group.error,
    });
    return catalogue;
  }
  if (
    !Array.isArray(group.records) ||
    (!group.records.length && !group.allowEmpty)
  ) {
    throw new Error(
      "Empty import rejected for " + group.key + "; previous data retained."
    );
  }
  var byId = new Map(
    catalogue.records.map(function (r) {
      return [r.id, r];
    })
  );
  var incoming = new Set();
  var added = 0;
  var changed = 0;
  function event(record, action) {
    catalogue.changes.unshift({
      id: record.id,
      kind: record.kind,
      title: record.title.en,
      action: action,
      at: stamp,
    });
  }
  group.records.forEach(function (record) {
    if (incoming.has(record.id)) return;
    incoming.add(record.id);
    var old = byId.get(record.id);
    record = Object.assign({}, record, { collection: group.key });
    if (!old) {
      added += 1;
      event(record, "added");
    } else if (model.fingerprint(old) !== model.fingerprint(record)) {
      changed += 1;
      event(record, "updated");
    }
    byId.set(record.id, record);
  });
  // Only a complete tracker snapshot may remove records. Bounded job scrapes
  // are incremental; a source outage must never erase last-known-good data.
  if (group.replace && !group.partial) {
    byId.forEach(function (record, id) {
      if (record.collection === group.key && !incoming.has(id)) {
        event(record, "removed");
        byId.delete(id);
      }
    });
  }
  catalogue.records = Array.from(byId.values()).sort(function (a, b) {
    return a.id.localeCompare(b.id);
  });
  catalogue.changes = catalogue.changes.slice(0, 200);
  catalogue.updatedAt = stamp;
  catalogue.sources[group.key] = {
    label: group.label,
    origin: group.origin || null,
    revision: group.revision || null,
    license: group.license || null,
    attribution: group.attribution || null,
    lastAttempt: stamp,
    lastSuccess: group.partial ? prior.lastSuccess || null : stamp,
    status: group.partial ? "partial" : "ok",
    error: group.partial
      ? (group.warnings || []).join("; ").slice(0, 1000)
      : null,
    count: catalogue.records.filter(function (r) {
      return r.collection === group.key;
    }).length,
    imported: incoming.size,
    added: added,
    updated: changed,
    mode: group.replace ? "snapshot" : "incremental",
  };
  return catalogue;
}

module.exports = {
  empty: empty,
  load: load,
  validate: validate,
  update: update,
  atomicWrite: atomicWrite,
  applyGroup: applyGroup,
};
