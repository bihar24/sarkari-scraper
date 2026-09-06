"use strict";

// Notification archive: a single-file SQLite database (via sql.js — pure
// WASM, no native builds, runs on Node 18+) holding EVERY notification ever
// sent, plus its own Bloom filter for fast "already notified?" pre-checks.
//
// Two-tier lookup: the in-memory Bloom filter answers instantly; a negative
// is definitive (no false negatives), a positive is confirmed against the
// exact table — so the answer is always exactly correct.

var fs = require("fs");
var path = require("path");
var initSqlJs = require("sql.js");
var bloom = require("./bloom");

var SCHEMA =
  "CREATE TABLE IF NOT EXISTS notifications (" +
  "url TEXT PRIMARY KEY, " +
  "title TEXT NOT NULL, " +
  "source TEXT, " +
  "first_seen TEXT NOT NULL, " +
  "last_seen TEXT NOT NULL, " +
  "payload TEXT); " +
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT); " +
  "CREATE INDEX IF NOT EXISTS idx_notifications_first_seen " +
  "ON notifications(first_seen);";

var sqlPromise = null;

function sql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs();
  }
  return sqlPromise;
}

function sourceOf(url) {
  try {
    return new URL(url).hostname;
  } catch (err) {
    return "";
  }
}

function loadFilter(db) {
  var rows = db.exec("SELECT value FROM meta WHERE key = 'bloom'");
  if (rows.length > 0 && rows[0].values.length > 0) {
    try {
      // filterFromJSON loads both new scalable snapshots and legacy
      // single-filter snapshots (old DBs keep working untouched).
      return bloom.filterFromJSON(JSON.parse(rows[0].values[0][0]));
    } catch (err) {
      // Corrupt filter: rebuild from the exact table below.
    }
  }
  var filter = new bloom.ScalableBloomFilter({
    capacity: 2000,
    fpRate: 0.01,
  });
  db.exec("SELECT url FROM notifications").forEach(function (result) {
    result.values.forEach(function (row) {
      filter.add(row[0]);
    });
  });
  return filter;
}

function describeFilter(filter) {
  if (filter.layers) {
    var bits = 0;
    filter.layers.forEach(function (layer) {
      bits += layer.filter.bits;
    });
    return {
      scalable: true,
      layers: filter.layers.length,
      bits: bits,
      count: filter.count,
      fpRate: filter.fpRate(),
    };
  }
  return {
    scalable: false,
    bits: filter.bits,
    hashes: filter.hashes,
    count: filter.count,
    fpRate: filter.fpRate(),
  };
}

function rowToObject(row) {
  return {
    url: row[0],
    title: row[1],
    source: row[2],
    first_seen: row[3],
    last_seen: row[4],
  };
}

function insertEntry(db, filter, entry) {
  var now = new Date().toISOString();
  var existing = db.exec("SELECT first_seen FROM notifications WHERE url = ?", [
    entry.url,
  ]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run("UPDATE notifications SET title = ?, last_seen = ? WHERE url = ?", [
      entry.title,
      now,
      entry.url,
    ]);
  } else {
    db.run(
      "INSERT INTO notifications (url, title, source, first_seen, last_seen, payload) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
      [
        entry.url,
        entry.title,
        entry.source || sourceOf(entry.url),
        now,
        now,
        entry.payload ? JSON.stringify(entry.payload) : null,
      ]
    );
    filter.add(entry.url);
  }
}

async function openNotifyDb(file) {
  var SQL = await sql();
  var db;
  try {
    // Note: sql.js validates lazily, so the SCHEMA exec is inside the
    // try — corrupt files fail here, not at construction.
    db = fs.existsSync(file)
      ? new SQL.Database(fs.readFileSync(file))
      : new SQL.Database();
    db.exec(SCHEMA);
  } catch (err) {
    throw new Error('cannot open database "' + file + '": ' + err.message);
  }
  var filter = loadFilter(db);

  function save() {
    db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('bloom', ?)", [
      JSON.stringify(filter.toJSON()),
    ]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(db.export()));
  }

  return {
    file: file,
    notified: function (url) {
      if (!filter.has(url)) {
        return false;
      }
      var rows = db.exec("SELECT 1 FROM notifications WHERE url = ?", [url]);
      return rows.length > 0 && rows[0].values.length > 0;
    },
    record: function (entry) {
      insertEntry(db, filter, entry);
      save();
    },
    // Batch write: one disk flush for N records (sql.js rewrites the whole
    // file on save, so per-record saves are O(n^2) on digest runs).
    recordMany: function (entries) {
      (entries || []).forEach(function (entry) {
        insertEntry(db, filter, entry);
      });
      save();
    },
    // Retention: forget notifications last seen over `days` ago. Safe for
    // the Bloom filter by construction — stale bits just become extra
    // positives that the exact table re-confirms (forgotten URLs re-alert).
    prune: function (days) {
      var cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      db.run("DELETE FROM notifications WHERE last_seen < ?", [cutoff]);
      var deleted = db.exec("SELECT changes()")[0].values[0][0];
      save();
      return deleted;
    },
    get: function (url) {
      var rows = db.exec(
        "SELECT url, title, source, first_seen, last_seen FROM notifications WHERE url = ?",
        [url]
      );
      if (rows.length === 0 || rows[0].values.length === 0) {
        return null;
      }
      return rowToObject(rows[0].values[0]);
    },
    recent: function (limit) {
      var rows = db.exec(
        "SELECT url, title, source, first_seen, last_seen FROM notifications " +
          "ORDER BY first_seen DESC LIMIT ?",
        [Math.max(1, limit || 10)]
      );
      if (rows.length === 0) {
        return [];
      }
      return rows[0].values.map(rowToObject);
    },
    all: function () {
      var rows = db.exec(
        "SELECT url, title, source, first_seen, last_seen FROM notifications " +
          "ORDER BY first_seen ASC"
      );
      if (rows.length === 0) {
        return [];
      }
      return rows[0].values.map(rowToObject);
    },
    stats: function () {
      var count = db.exec("SELECT COUNT(*) FROM notifications")[0].values[0][0];
      var span = db.exec(
        "SELECT MIN(first_seen), MAX(first_seen) FROM notifications"
      )[0].values[0];
      var sources = [];
      db.exec(
        "SELECT source, COUNT(*) FROM notifications GROUP BY source ORDER BY COUNT(*) DESC"
      ).forEach(function (result) {
        result.values.forEach(function (row) {
          sources.push({ source: row[0], count: row[1] });
        });
      });
      return {
        count: count,
        first: span[0],
        last: span[1],
        sources: sources,
        bloom: describeFilter(filter),
      };
    },
    save: save,
    close: function () {
      save();
      db.close();
    },
  };
}

module.exports.openNotifyDb = openNotifyDb;
