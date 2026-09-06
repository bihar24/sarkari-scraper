"use strict";

// TEMPORARY CI diagnostic (reverted before merge). Runs every test file in
// its own `node --test` process and reports per-file failures as workflow
// annotations, so the failing files are visible without CI log access.

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

function escapeAnnotation(text) {
  return String(text)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

var files = fs
  .readdirSync(__dirname)
  .filter(function (f) {
    return /\.test\.js$/.test(f);
  })
  .sort();

var failed = [];

files.forEach(function (f) {
  var result = cp.spawnSync(
    process.execPath,
    ["--test", path.join(__dirname, f)],
    { encoding: "utf8", timeout: 240000, maxBuffer: 8 * 1024 * 1024 }
  );
  var out = (result.stdout || "") + (result.stderr || "");
  var match = out.match(/# fail (\d+)/);
  var fails = match ? Number(match[1]) : -1;
  var status = result.status === null ? "timeout" : String(result.status);
  console.log(
    f + ": exit=" + status + " fail=" + fails + " signal=" + result.signal
  );
  if (result.status !== 0 || fails !== 0) {
    failed.push(f);
    if (failed.length <= 8) {
      var tail = out
        .split("\n")
        .filter(function (line) {
          return (
            /not ok|failureType|error:|Error/.test(line) ||
            /^# (fail|tests)/.test(line)
          );
        })
        .slice(-12)
        .join("\n")
        .slice(-1200);
      console.log(
        "::error file=test/" +
          escapeAnnotation(f) +
          "::" +
          escapeAnnotation(
            f + " FAILED (exit=" + status + ", fail=" + fails + ")\n" + tail
          )
      );
    }
  }
});

if (failed.length > 0) {
  console.log(
    "::error::FAILING FILES (" + failed.length + "): " + failed.join(" ")
  );
  console.log("FAILING FILES: " + failed.join(" "));
  process.exit(1);
}
console.log("ALL " + files.length + " TEST FILES GREEN");
