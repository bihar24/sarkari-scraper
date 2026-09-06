"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var execFile = require("node:child_process").execFile;
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");

var TOOL = path.join(__dirname, "..", "tools", "new-source.js");

function run(args) {
  return new Promise(function (resolve) {
    execFile(
      process.execPath,
      [TOOL].concat(args),
      { timeout: 30000 },
      function (error, stdout, stderr) {
        resolve({
          code: error && typeof error.code === "number" ? error.code : 0,
          stdout: stdout,
          stderr: stderr,
        });
      }
    );
  });
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "new-source-"));
}

describe("tools/new-source scaffold", function () {
  it("--help exits 0", async function () {
    var result = await run(["--help"]);
    assert.equal(result.code, 0);
    assert.match(result.stderr, /--domain <domain>/);
  });

  it("scaffolds a jobs parser pair", async function () {
    var root = tempRoot();
    var result = await run([
      "--domain",
      "example.invalid",
      "--type",
      "jobs",
      "--entry",
      "https://example.invalid/jobs",
      "--root",
      root,
    ]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /next steps/);
    var listSrc = fs.readFileSync(
      path.join(root, "scripts", "example.invalid", "job-list.js"),
      "utf8"
    );
    var detailSrc = fs.readFileSync(
      path.join(root, "scripts", "example.invalid", "job-detail.js"),
      "utf8"
    );
    assert.ok(listSrc.indexOf("scrapJobList") !== -1);
    assert.ok(listSrc.indexOf("https://example.invalid/jobs") !== -1);
    assert.ok(detailSrc.indexOf("scrapJobDetail") !== -1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scaffolds a papers parser pair", async function () {
    var root = tempRoot();
    var result = await run([
      "--domain",
      "papers.invalid",
      "--type",
      "papers",
      "--root",
      root,
    ]);
    assert.equal(result.code, 0);
    var listSrc = fs.readFileSync(
      path.join(root, "scripts", "papers.invalid", "papers-list.js"),
      "utf8"
    );
    assert.ok(listSrc.indexOf("scrapPaperList") !== -1);
    assert.ok(listSrc.indexOf("https://papers.invalid/") !== -1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("refuses bad input and existing parsers", async function () {
    var root = tempRoot();
    var badDomain = await run([
      "--domain",
      "www.bad",
      "--type",
      "jobs",
      "--root",
      root,
    ]);
    assert.equal(badDomain.code, 2);
    var badType = await run([
      "--domain",
      "ok.invalid",
      "--type",
      "nope",
      "--root",
      root,
    ]);
    assert.equal(badType.code, 2);
    var first = await run([
      "--domain",
      "dup.invalid",
      "--type",
      "jobs",
      "--root",
      root,
    ]);
    assert.equal(first.code, 0);
    var second = await run([
      "--domain",
      "dup.invalid",
      "--type",
      "jobs",
      "--root",
      root,
    ]);
    assert.equal(second.code, 2);
    assert.match(second.stderr, /already has/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects absurdly long domains", async function () {
    var root = tempRoot();
    try {
      var long = new Array(300).join("a") + ".invalid";
      var result = await run([
        "--domain",
        long,
        "--type",
        "jobs",
        "--root",
        root,
      ]);
      assert.equal(result.code, 2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
