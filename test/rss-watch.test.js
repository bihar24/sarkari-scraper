"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var execFile = require("node:child_process").execFile;
var fs = require("node:fs");
var http = require("node:http");
var os = require("node:os");
var path = require("node:path");

var TOOL = path.join(__dirname, "..", "tools", "rss-watch.js");

function feedXml(items) {
  return (
    '<?xml version="1.0"?><rss version="2.0"><channel><title>Jobs</title>' +
    items +
    "</channel></rss>"
  );
}

function item(n, title) {
  return (
    "<item><title>" +
    title +
    "</title><link>https://site.test/w/" +
    n +
    "</link></item>"
  );
}

function run(args, env) {
  return new Promise(function (resolve) {
    execFile(
      process.execPath,
      [TOOL].concat(args),
      { timeout: 30000, env: Object.assign({}, process.env, env || {}) },
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

describe("tools/rss-watch", function () {
  it("--help exits 0", async function () {
    var result = await run(["--help"]);
    assert.equal(result.code, 0);
    assert.match(result.stderr, /--feeds-file/);
  });

  it("detects new items across runs and exports outputs", async function () {
    var body = feedXml(item(1, "Watch Post One") + item(2, "Watch Post Two"));
    var server = http.createServer(function (req, res) {
      if (req.url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nAllow: /\n");
        return;
      }
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end(body);
    });
    await new Promise(function (resolve) {
      server.listen(0, "127.0.0.1", resolve);
    });
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-watch-"));
    try {
      var url = "http://127.0.0.1:" + server.address().port + "/feed.xml";
      var feedsFile = path.join(dir, "feeds.txt");
      var stateFile = path.join(dir, "state.json");
      var outFile = path.join(dir, "github-output.txt");
      fs.writeFileSync(feedsFile, "# comment line\n" + url + "\n");
      var args = ["--feeds-file", feedsFile, "--state", stateFile];

      var first = await run(args, { GITHUB_OUTPUT: outFile });
      assert.equal(first.code, 0);
      assert.equal(JSON.parse(first.stdout).newItems, 2);
      assert.match(first.stdout, /Watch Post One/);
      var out = fs.readFileSync(outFile, "utf8");
      assert.ok(out.indexOf("new-items=true") !== -1);
      assert.ok(out.indexOf("count=2") !== -1);
      var state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      assert.equal(state.feeds[url].items.length, 2);

      var second = await run(args);
      assert.equal(second.code, 0);
      assert.equal(JSON.parse(second.stdout).newItems, 0);

      body = feedXml(
        item(1, "Watch Post One") +
          item(2, "Watch Post Two") +
          item(3, "Watch Post Three")
      );
      var third = await run(args);
      assert.equal(third.code, 0);
      var report = JSON.parse(third.stdout);
      assert.equal(report.newItems, 1);
      assert.equal(report.items[0].title, "Watch Post Three");
    } finally {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stays green on dead feeds and empty configs", async function () {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-watch-"));
    try {
      var feedsFile = path.join(dir, "feeds.txt");
      fs.writeFileSync(
        feedsFile,
        "http://127.0.0.1:9/feed.xml\nnot-a-url\n# nothing else\n"
      );
      var dead = await run([
        "--feeds-file",
        feedsFile,
        "--state",
        path.join(dir, "s.json"),
      ]);
      assert.equal(dead.code, 0);
      assert.equal(JSON.parse(dead.stdout).newItems, 0);
      assert.match(dead.stderr, /skipping/);

      var emptyFile = path.join(dir, "empty.txt");
      fs.writeFileSync(emptyFile, "# no feeds yet\n");
      var empty = await run([
        "--feeds-file",
        emptyFile,
        "--state",
        path.join(dir, "s2.json"),
      ]);
      assert.equal(empty.code, 0);
      assert.match(empty.stderr, /no feeds configured/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects bad usage with exit 2", async function () {
    var missing = await run([]);
    assert.equal(missing.code, 2);
    var badFile = await run(["--feeds-file", "/nope/feeds.txt"]);
    assert.equal(badFile.code, 2);
    assert.match(badFile.stderr, /cannot read feeds file/);
  });

  it("falls back to the URL when an item has no title text", async function () {
    var noTitle =
      '<?xml version="1.0"?><rss version="2.0"><channel>' +
      "<item><link>https://site.test/w/9</link>" +
      "<description>Summary only.</description></item>" +
      "</channel></rss>";
    var server = http.createServer(function (req, res) {
      if (req.url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nAllow: /\n");
        return;
      }
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end(noTitle);
    });
    await new Promise(function (resolve) {
      server.listen(0, "127.0.0.1", resolve);
    });
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-watch-"));
    try {
      var url = "http://127.0.0.1:" + server.address().port + "/feed.xml";
      var feedsFile = path.join(dir, "feeds.txt");
      fs.writeFileSync(feedsFile, url + "\n");
      var result = await run([
        "--feeds-file",
        feedsFile,
        "--state",
        path.join(dir, "s.json"),
      ]);
      assert.equal(result.code, 0);
      var report = JSON.parse(result.stdout);
      assert.equal(report.newItems, 1);
      assert.equal(report.items[0].title, "https://site.test/w/9");
    } finally {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("automation wiring", function () {
  it("workflows declare the layered triggers", function () {
    var root = path.join(__dirname, "..", ".github", "workflows");
    var scrape = fs.readFileSync(path.join(root, "scrape.yml"), "utf8");
    var watch = fs.readFileSync(path.join(root, "rss-watch.yml"), "utf8");
    assert.ok(scrape.indexOf("schedule:") !== -1);
    assert.ok(scrape.indexOf("workflow_dispatch") !== -1);
    assert.ok(scrape.indexOf("repository_dispatch") !== -1);
    assert.ok(scrape.indexOf("workflow_call") !== -1);
    assert.ok(watch.indexOf("schedule:") !== -1);
    assert.ok(watch.indexOf("tools/rss-watch.js") !== -1);
    assert.ok(watch.indexOf("gh workflow run") !== -1);
    var feeds = fs.readFileSync(
      path.join(__dirname, "..", "feeds.txt"),
      "utf8"
    );
    assert.ok(feeds.indexOf("docs/AUTOMATION.md") !== -1);
  });
});
