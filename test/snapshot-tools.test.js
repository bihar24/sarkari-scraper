"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var cp = require("node:child_process");

var root = path.join(__dirname, "..");

function run(tool, args, cwd) {
  return cp.spawnSync(process.execPath, [path.join(root, tool)].concat(args), {
    cwd: cwd || root,
    encoding: "utf8",
    timeout: 30000,
  });
}

function temp(t) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "sarkari-snapshot-"));
  t.after(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function jobRecord(n) {
  return {
    postName: "Fixture job " + n,
    lastDate: "30-Sep-2026",
    link: "https://example.gov.in/job/" + n,
  };
}

function paperRecord(n) {
  return {
    exam: "SSC CGL " + n,
    title: "SSC CGL " + n + " Previous Papers",
    link: "https://example.gov.in/paper/" + n,
  };
}

test.describe("snapshot validation and retention tools", function () {
  test.it(
    "validate-snapshot rejects empty and accept usable snapshots",
    function (t) {
      var dir = temp(t);
      var empty = path.join(dir, "empty.json");
      var valid = path.join(dir, "valid.json");
      fs.writeFileSync(empty, "[]\n");
      fs.writeFileSync(valid, JSON.stringify([jobRecord(1)]));
      assert.notEqual(
        run("tools/validate-snapshot.js", ["--input", empty, "--kind", "job"])
          .status,
        0
      );
      var good = run("tools/validate-snapshot.js", [
        "--input",
        valid,
        "--kind",
        "job",
      ]);
      assert.equal(good.status, 0);
      assert.match(good.stdout, /"usableRecords":1/);
    }
  );

  test.it(
    "build-aggregate cannot erase a prior non-empty aggregate",
    function (t) {
      var dir = temp(t);
      var aOk = path.join(dir, "jobs-a.json");
      var bEmpty = path.join(dir, "jobs-b.json");
      var aggregate = path.join(dir, "jobs-all.json");
      fs.writeFileSync(aOk, JSON.stringify([jobRecord(1)]));
      fs.writeFileSync(bEmpty, "[]\n");
      var first = run("tools/build-aggregate.js", [
        "--data",
        dir,
        "--kind",
        "job",
        "--output",
        aggregate,
      ]);
      assert.equal(first.status, 0);
      var before = fs.readFileSync(aggregate, "utf8");
      assert.match(before, /Fixture job 1/);

      fs.writeFileSync(aOk, "[]\n");
      var second = run("tools/build-aggregate.js", [
        "--data",
        dir,
        "--kind",
        "job",
        "--output",
        aggregate,
      ]);
      assert.notEqual(second.status, 0);
      assert.equal(fs.readFileSync(aggregate, "utf8"), before);
    }
  );

  test.it(
    "build-catalog produces a validated snapshot with per-source support",
    function (t) {
      var dir = temp(t);
      var dataDir = path.join(dir, "data");
      var storeFile = path.join(dataDir, "catalog.json");
      fs.mkdirSync(dataDir);
      fs.writeFileSync(
        path.join(dataDir, "jobs-a.json"),
        JSON.stringify([jobRecord(1)])
      );
      fs.writeFileSync(
        path.join(dataDir, "papers-a.json"),
        JSON.stringify([paperRecord(1)])
      );
      var result = run("tools/build-catalog.js", [
        "--store",
        storeFile,
        "--data",
        dataDir,
      ]);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      var catalog = JSON.parse(fs.readFileSync(storeFile, "utf8"));
      assert.equal(catalog.records.length, 2);
      var kinds = catalog.records.map(function (r) {
        return r.kind;
      });
      assert.equal(kinds.indexOf("job") !== -1, true);
      assert.equal(kinds.indexOf("paper") !== -1, true);
      assert.equal(catalog.sources["job:jobs-a.json"].status, "ok");
      assert.equal(catalog.sources["paper:papers-a.json"].status, "ok");
    }
  );

  test.it(
    "verify-catalog fails on empty and on missing required kinds",
    function (t) {
      var dir = temp(t);
      var storeFile = path.join(dir, "catalog.json");
      fs.writeFileSync(
        storeFile,
        JSON.stringify({
          schemaVersion: 1,
          updatedAt: null,
          demo: false,
          records: [],
          sources: {},
          changes: [],
          directory: null,
        })
      );
      assert.notEqual(
        run("tools/verify-catalog.js", ["--store", storeFile]).status,
        0
      );
    }
  );
});
