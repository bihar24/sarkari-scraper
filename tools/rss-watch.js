#!/usr/bin/env node
"use strict";

// Usage: node tools/rss-watch.js --feeds-file <file> [--state <file>]
// Polls RSS/Atom feeds for new items and records what was seen in a state
// file. Prints JSON to stdout; when $GITHUB_OUTPUT is set it also exports
// new-items/count for workflow conditionals. Every feed is fail-soft:
// dead/blocked feeds warn and skip without failing the run.

var fs = require("fs");
var path = require("path");
var constant = require("../utils/constant");
var feed = require("../utils/feed");
var http = require("../utils/http");
var logger = require("../utils/logger");
var runtime = require("../utils/runtime");

var MAX_SEEN_PER_FEED = 200;

var HELP = [
  "Usage: node tools/rss-watch.js --feeds <url,...> | --feeds-file <file> [flags]",
  "",
  "Flags:",
  "  --feeds <urls>       Comma-separated RSS/Atom feed URL(s).",
  "  --feeds-file <file>  File with one feed URL per line (# comments allowed).",
  "  --state <file>       Seen-items state file (default: data/feed-state.json).",
  "  --quiet              Log errors only.",
  "  -h, --help           Show this help.",
  "",
  "Example:",
  "  node tools/rss-watch.js --feeds-file feeds.txt --state data/feed-state.json",
];

function fail(message, exitCode) {
  console.error("Error: " + message);
  process.exit(exitCode || 2);
}

function flagValue(argv, name) {
  var index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) {
    return null;
  }
  return argv[index + 1];
}

function readFeedsFile(file) {
  var raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    fail('cannot read feeds file "' + file + '": ' + err.message);
  }
  return raw
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(function (line) {
      return line !== "" && line.charAt(0) !== "#";
    });
}

function loadState(file) {
  try {
    var parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.feeds) {
      return parsed;
    }
  } catch (err) {
    // Missing/corrupt state starts fresh; the run rewrites it.
  }
  return { feeds: {} };
}

function saveState(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  } catch (err) {
    fail('cannot write state file "' + file + '": ' + err.message, 1);
  }
}

function writeOutput(values) {
  var outFile = process.env.GITHUB_OUTPUT;
  if (!outFile) {
    return;
  }
  var lines = Object.keys(values).map(function (key) {
    return key + "=" + values[key];
  });
  try {
    fs.appendFileSync(outFile, lines.join("\n") + "\n");
  } catch (err) {
    console.error("Warning: cannot write $GITHUB_OUTPUT: " + err.message);
  }
}

async function main() {
  var argv = process.argv.slice(2);
  if (argv.indexOf("-h") !== -1 || argv.indexOf("--help") !== -1) {
    console.error(HELP.join("\n"));
    process.exit(0);
  }
  var log = logger.createLogger({ quiet: argv.indexOf("--quiet") !== -1 });

  var feedUrls = [];
  var feedsArg = flagValue(argv, "--feeds");
  var feedsFile = flagValue(argv, "--feeds-file");
  if (feedsArg) {
    feedUrls = feedsArg
      .split(",")
      .map(function (entry) {
        return entry.trim();
      })
      .filter(function (entry) {
        return entry !== "";
      });
  } else if (feedsFile) {
    feedUrls = readFeedsFile(feedsFile);
  } else {
    fail("need --feeds <url,...> or --feeds-file <file>.");
  }
  var statePath = flagValue(argv, "--state") || "data/feed-state.json";

  if (feedUrls.length === 0) {
    log.warn("no feeds configured; nothing to watch.");
    console.log(JSON.stringify({ feeds: 0, newItems: 0, items: [] }));
    writeOutput({ "new-items": "false", count: "0" });
    return;
  }

  var rt = runtime.createRuntime({
    timeoutMs: constant.REQUEST_TIMEOUT_MS,
    retries: constant.DEFAULT_RETRIES,
    retryDelayMs: constant.RETRY_BASE_DELAY_MS,
    quiet: argv.indexOf("--quiet") !== -1,
  });
  log = rt.log;

  var state = loadState(statePath);
  var fresh = [];
  var checked = 0;
  for (var i = 0; i < feedUrls.length; i++) {
    var feedUrl = feedUrls[i];
    var parsed;
    try {
      parsed = new URL(feedUrl);
    } catch (err) {
      log.warn('skipping malformed feed URL "' + feedUrl + '".');
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      log.warn("skipping non-http(s) feed URL: " + feedUrl);
      continue;
    }
    var canonical = parsed.toString();
    var allowed = await runtime.ensureRobotsAllowed(rt.robots, canonical, {
      ignore: false,
      log: log,
    });
    if (!allowed) {
      log.warn("skipping feed disallowed by robots.txt: " + canonical);
      continue;
    }
    var fetched;
    try {
      fetched = await feed.fetchFeed(rt.client, canonical);
    } catch (error) {
      log.warn("skipping feed " + canonical + ": " + http.describeError(error));
      continue;
    }
    checked += 1;
    var seen = {};
    ((state.feeds[canonical] && state.feeds[canonical].items) || []).forEach(
      function (link) {
        seen[link] = true;
      }
    );
    var links = [];
    fetched.jobs.forEach(function (job) {
      links.push(job.url);
      if (!seen[job.url]) {
        seen[job.url] = true;
        // detail[1] is Title/Published (strings) when present — but a bare
        // Summary record holds an array, so fall back to the URL unless we
        // genuinely have text.
        var second = job.detail.length > 1 ? job.detail[1].value : null;
        var title = typeof second === "string" && second ? second : job.url;
        fresh.push({ feed: canonical, title: title, link: job.url });
      }
    });
    state.feeds[canonical] = {
      lastCheck: new Date().toISOString(),
      items: links.slice(0, MAX_SEEN_PER_FEED),
    };
    log.info(canonical + ": " + fetched.jobs.length + " item(s).");
  }

  saveState(statePath, state);
  log.info(
    "checked " + checked + " feed(s), " + fresh.length + " new item(s)."
  );
  console.log(
    JSON.stringify({ feeds: checked, newItems: fresh.length, items: fresh })
  );
  writeOutput({
    "new-items": fresh.length > 0 ? "true" : "false",
    count: String(fresh.length),
  });
}

main();
