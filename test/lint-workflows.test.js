"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var execFile = require("node:child_process").execFile;
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");

var TOOL = path.join(__dirname, "..", "tools", "lint-workflows.js");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wflint-"));
}

function writeWorkflow(dir, name, body) {
  fs.writeFileSync(path.join(dir, name), body);
}

function run(dir, callback) {
  execFile(
    process.execPath,
    [TOOL, "--dir", dir],
    function (error, stdout, stderr) {
      callback({
        code: error ? error.code : 0,
        stdout: String(stdout),
        stderr: String(stderr),
      });
    }
  );
}

var VALID = [
  "name: Example",
  "on:",
  "  workflow_dispatch:",
  "jobs:",
  "  build:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - run: echo hi",
  "",
].join("\n");

describe("tools/lint-workflows.js", function () {
  it("accepts a well-formed workflow", function (t, done) {
    var dir = workspace();
    writeWorkflow(dir, "ok.yml", VALID);
    run(dir, function (result) {
      assert.equal(result.code, 0);
      assert.match(result.stdout, /1 workflow file\(s\) validated/);
      done();
    });
  });

  it("rejects the secrets context in a step if: (the scrape.yml regression)", function (t, done) {
    var dir = workspace();
    writeWorkflow(
      dir,
      "bad.yml",
      [
        "name: Example",
        "on:",
        "  push:",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - name: Alert",
        "        if: failure() && secrets.TOKEN != ''",
        "        run: echo alert",
        "",
      ].join("\n")
    );
    run(dir, function (result) {
      assert.equal(result.code, 1);
      assert.match(result.stdout, /secrets/);
      assert.match(result.stdout, /not available in any if:/);
      done();
    });
  });

  it("rejects the secrets context in a job if:", function (t, done) {
    var dir = workspace();
    writeWorkflow(
      dir,
      "bad.yml",
      [
        "name: Example",
        "on:",
        "  push:",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    if: secrets.TOKEN != ''",
        "    steps:",
        "      - run: echo hi",
        "",
      ].join("\n")
    );
    run(dir, function (result) {
      assert.equal(result.code, 1);
      assert.match(result.stdout, /job build: if: uses "secrets"/);
      done();
    });
  });

  it("rejects step-only contexts used in a job-level if:", function (t, done) {
    var dir = workspace();
    writeWorkflow(
      dir,
      "bad.yml",
      [
        "name: Example",
        "on:",
        "  push:",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    if: steps.probe.outputs.ready == 'true'",
        "    steps:",
        "      - run: echo hi",
        "",
      ].join("\n")
    );
    run(dir, function (result) {
      assert.equal(result.code, 1);
      assert.match(result.stdout, /steps.*job-level if:/);
      done();
    });
  });

  it("allows step-level contexts that GitHub permits", function (t, done) {
    var dir = workspace();
    writeWorkflow(
      dir,
      "ok.yml",
      [
        "name: Example",
        "on:",
        "  push:",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: probe",
        "        run: echo ready",
        "      - if: steps.probe.outputs.ready == 'true' && env.FLAG != ''",
        "        run: echo go",
        "",
      ].join("\n")
    );
    run(dir, function (result) {
      assert.equal(result.code, 0);
      done();
    });
  });

  it("allows secrets outside if: (env and with blocks)", function (t, done) {
    var dir = workspace();
    writeWorkflow(
      dir,
      "ok.yml",
      [
        "name: Example",
        "on:",
        "  push:",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - if: failure()",
        "        env:",
        "          TOKEN: ${{ secrets.TOKEN }}",
        '        run: echo "$TOKEN"',
        "",
      ].join("\n")
    );
    run(dir, function (result) {
      assert.equal(result.code, 0);
      done();
    });
  });

  it("does not flag a context name inside a quoted expression literal", function (t, done) {
    var dir = workspace();
    writeWorkflow(
      dir,
      "ok.yml",
      [
        "name: Example",
        "on:",
        "  push:",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - if: github.event.head_commit.message != 'secrets.TOKEN'",
        "        run: echo hi",
        "",
      ].join("\n")
    );
    run(dir, function (result) {
      assert.equal(result.code, 0);
      done();
    });
  });

  it("reports invalid YAML", function (t, done) {
    var dir = workspace();
    writeWorkflow(dir, "bad.yml", "name: [unclosed\non: push\n");
    run(dir, function (result) {
      assert.equal(result.code, 1);
      assert.match(result.stdout, /invalid YAML/);
      done();
    });
  });

  it("reports a job with no runs-on", function (t, done) {
    var dir = workspace();
    writeWorkflow(
      dir,
      "bad.yml",
      [
        "name: Example",
        "on:",
        "  push:",
        "jobs:",
        "  build:",
        "    steps:",
        "      - run: echo hi",
        "",
      ].join("\n")
    );
    run(dir, function (result) {
      assert.equal(result.code, 1);
      assert.match(result.stdout, /missing `runs-on`/);
      done();
    });
  });

  it("reports a missing on: block", function (t, done) {
    var dir = workspace();
    writeWorkflow(
      dir,
      "bad.yml",
      [
        "name: Example",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: echo hi",
        "",
      ].join("\n")
    );
    run(dir, function (result) {
      assert.equal(result.code, 1);
      assert.match(result.stdout, /missing top-level `on:`/);
      done();
    });
  });

  it("reports unbalanced expression delimiters", function (t, done) {
    var dir = workspace();
    writeWorkflow(
      dir,
      "bad.yml",
      [
        "name: Example",
        "on:",
        "  push:",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        '      - run: echo "${{ github.sha"',
        "",
      ].join("\n")
    );
    run(dir, function (result) {
      assert.equal(result.code, 1);
      assert.match(result.stdout, /unbalanced/);
      done();
    });
  });

  it("validates the repository's own workflows", function (t, done) {
    var dir = path.join(__dirname, "..", ".github", "workflows");
    run(dir, function (result) {
      assert.equal(
        result.code,
        0,
        "repo workflows must pass: " + result.stdout
      );
      done();
    });
  });
});
