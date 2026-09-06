#!/usr/bin/env node
"use strict";

// Usage: node tools/notify-db.js --db <file> [--stats | --check <url> | --recent [n] | --export <file>]
// Inspect the SQLite notification archive written by `job-digest.js --db`:
// membership checks (Bloom pre-filter + exact table), recent items, stats,
// and JSON export (the escape hatch for Codespaces ephemerality).

var fs = require("fs");
var notifydb = require("../utils/notifydb");

var HELP = [
  "Usage: node tools/notify-db.js --db <file> [query]",
  "",
  "Queries (default: --stats):",
  "  --stats            Archive totals, span, per-source counts, Bloom fp rate.",
  "  --check <url>      Print NOTIFIED <title> <first_seen>, or NEW if unseen.",
  "  --recent [n]       Newest n notifications (default 10).",
  "  --export <file>    Write every notification as JSON (backup / migrate).",
  "  --prune <days>     Forget notifications last seen over <days> ago.",
  "  -h, --help         Show this help.",
  "",
  "Example:",
  "  node tools/notify-db.js --db data/notifications.db --recent 5",
];

function fail(message) {
  console.error("Error: " + message);
  process.exit(2);
}

function flagValue(argv, name) {
  var index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) {
    return null;
  }
  var value = argv[index + 1];
  if (value.charAt(0) === "-") {
    return null;
  }
  return value;
}

async function main() {
  var argv = process.argv.slice(2);
  if (argv.indexOf("-h") !== -1 || argv.indexOf("--help") !== -1) {
    console.error(HELP.join("\n"));
    process.exit(0);
  }
  var dbFile = flagValue(argv, "--db");
  if (!dbFile) {
    fail("need --db <file>.");
  }
  if (!fs.existsSync(dbFile)) {
    fail('database file "' + dbFile + '" does not exist.');
  }

  var db;
  try {
    db = await notifydb.openNotifyDb(dbFile);
  } catch (error) {
    fail(error.message);
  }

  if (argv.indexOf("--check") !== -1) {
    var url = flagValue(argv, "--check");
    if (!url) {
      fail("need --check <url>.");
    }
    var row = db.get(url);
    if (row) {
      console.log("NOTIFIED " + row.title + " | first seen " + row.first_seen);
    } else {
      console.log("NEW " + url);
    }
  } else if (argv.indexOf("--recent") !== -1) {
    var rawN = flagValue(argv, "--recent");
    var n = rawN === null ? 10 : parseInt(rawN, 10);
    if (isNaN(n) || n < 1) {
      fail('invalid --recent count "' + rawN + '".');
    }
    var items = db.recent(n);
    if (items.length === 0) {
      console.log("(archive is empty)");
    }
    items.forEach(function (entry) {
      console.log(entry.first_seen + " | " + entry.title + " | " + entry.url);
    });
  } else if (argv.indexOf("--export") !== -1) {
    var outFile = flagValue(argv, "--export");
    if (!outFile) {
      fail("need --export <file>.");
    }
    try {
      fs.writeFileSync(outFile, JSON.stringify(db.all(), null, 2));
    } catch (error) {
      fail('cannot write "' + outFile + '": ' + error.message);
    }
    console.log(
      "exported " + db.all().length + " notification(s) to " + outFile
    );
  } else if (argv.indexOf("--prune") !== -1) {
    var rawDays = flagValue(argv, "--prune");
    var days = rawDays === null ? NaN : parseFloat(rawDays);
    if (isNaN(days) || days < 0) {
      fail('invalid --prune days "' + rawDays + '".');
    }
    var deleted = db.prune(days);
    console.log(
      "pruned " + deleted + " notification(s) older than " + days + " day(s)."
    );
  } else {
    var stats = db.stats();
    console.log("notifications: " + stats.count);
    console.log("first: " + (stats.first || "-"));
    console.log("last: " + (stats.last || "-"));
    stats.sources.forEach(function (entry) {
      console.log("source: " + entry.source + " (" + entry.count + ")");
    });
    console.log(
      "bloom: " +
        stats.bloom.count +
        " keys, " +
        stats.bloom.bits +
        " bits, fp~" +
        stats.bloom.fpRate.toFixed(4)
    );
  }
  db.close();
}

main();
