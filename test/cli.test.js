"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var execFile = require("node:child_process").execFile;
var path = require("node:path");

function run(script, args, env) {
  return new Promise(function (resolve) {
    execFile(
      process.execPath,
      [path.join(__dirname, "..", script)].concat(args),
      { timeout: 60000, env: Object.assign({}, process.env, env || {}) },
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

describe("CLI wiring (no network)", function () {
  it("scrap-job-list --help exits 0 with usage on stderr", async function () {
    var result = await run("scrap-job-list.js", ["--help"]);
    assert.equal(result.code, 0);
    assert.match(result.stderr, /Usage: node scrap-job-list\.js/);
    assert.equal(result.stdout, "");
  });

  it("scrap-job-list rejects unsupported domains with exit 2", async function () {
    var result = await run("scrap-job-list.js", ["-d", "evil.com"]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Invalid value/);
  });

  it("scrap-job-detail rejects a malformed URL without crashing", async function () {
    var result = await run("scrap-job-detail.js", ["-u", "foo"]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /not a valid URL/);
  });

  it("scrap-job-detail rejects unsupported domains", async function () {
    var result = await run("scrap-job-detail.js", [
      "-u",
      "https://evil.com/job/1",
    ]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /not supported/);
  });

  it("scrap-job-detail requires -u", async function () {
    var result = await run("scrap-job-detail.js", []);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Missing required flag/);
  });

  it("run-scrapper requires -o and documents its flags", async function () {
    var missing = await run("run-scrapper.js", []);
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /Missing required flag/);

    var help = await run("run-scrapper.js", ["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stderr, /--max-jobs/);
  });

  it("scrap-paper-list --help exits 0 with usage on stderr", async function () {
    var result = await run("scrap-paper-list.js", ["--help"]);
    assert.equal(result.code, 0);
    assert.match(result.stderr, /Usage: node scrap-paper-list\.js/);
    assert.equal(result.stdout, "");
  });

  it("scrap-paper-list rejects unsupported domains with exit 2", async function () {
    var result = await run("scrap-paper-list.js", ["-d", "evil.com"]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Invalid value/);
  });

  it("scrap-paper-detail requires -u and validates URLs", async function () {
    var missing = await run("scrap-paper-detail.js", []);
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /Missing required flag/);
    var malformed = await run("scrap-paper-detail.js", ["-u", "foo"]);
    assert.equal(malformed.code, 2);
    assert.match(malformed.stderr, /not a valid URL/);
    var evil = await run("scrap-paper-detail.js", ["-u", "https://evil.com/x"]);
    assert.equal(evil.code, 2);
    assert.match(evil.stderr, /not supported/);
  });

  it("--list-sources prints the catalog on stdout", async function () {
    var jobs = await run("scrap-job-list.js", ["--list-sources"]);
    assert.equal(jobs.code, 0);
    assert.match(jobs.stdout, /freejobalert\.com/);
    var papers = await run("scrap-paper-detail.js", ["--list-sources"]);
    assert.equal(papers.code, 0);
    assert.match(papers.stdout, /upsc\.gov\.in/);
    assert.match(papers.stdout, /beta/);
  });
});

describe("job-digest CLI", function () {
  it("--help works and some input is required", async function () {
    var help = await run("job-digest.js", ["--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stderr, /Usage: node job-digest\.js/);
    assert.match(help.stderr, /--rss-input/);
    assert.equal(help.stdout, "");

    var missing = await run("job-digest.js", []);
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /need -i <file> and\/or --rss-input/);
  });

  it("rejects bad input files, alert targets and languages", async function () {
    var badFile = await run("job-digest.js", ["-i", "/nope/missing.json"]);
    assert.equal(badFile.code, 2);
    assert.match(badFile.stderr, /cannot read/);

    var badTarget = await run("job-digest.js", ["-i", "x", "--alert", "sms"]);
    assert.equal(badTarget.code, 2);
    assert.match(badTarget.stderr, /Unknown alert target/);

    var badLang = await run("job-digest.js", ["-i", "x", "--translate", "xx!"]);
    assert.equal(badLang.code, 2);
    assert.match(badLang.stderr, /Invalid language/);
  });

  it("initialises state on first run, then dry-runs only new jobs", async function () {
    var fs = require("node:fs");
    var os = require("node:os");
    var testPath = require("node:path");
    var dir = fs.mkdtempSync(testPath.join(os.tmpdir(), "digest-cli-"));
    var input = testPath.join(dir, "jobs.json");
    var state = testPath.join(dir, "state.json");
    try {
      var job = function (n) {
        return {
          url: "https://site.test/job/" + n,
          detail: [
            { key: "Name of Post", value: "Post " + n, type: "String" },
            { key: "Last Date", value: "01-Sep-2026", type: "String" },
          ],
        };
      };
      fs.writeFileSync(input, JSON.stringify([job(1)]));

      var first = await run("job-digest.js", [
        "-i",
        input,
        "--state",
        state,
        "--alert",
        "telegram",
      ]);
      assert.equal(first.code, 0);
      assert.match(first.stderr, /state initialised/);
      assert.equal(first.stdout, ""); // no alerts on first run

      fs.writeFileSync(input, JSON.stringify([job(1), job(2)]));
      var second = await run("job-digest.js", [
        "-i",
        input,
        "--state",
        state,
        "--alert",
        "telegram",
        "--dry-run",
      ]);
      assert.equal(second.code, 0);
      assert.match(second.stdout, /Post 2/);
      assert.doesNotMatch(second.stdout, /Post 1/);

      var rss = testPath.join(dir, "feed.xml");
      var ics = testPath.join(dir, "dates.ics");
      var out = testPath.join(dir, "digest.json");
      var outputs = await run("job-digest.js", [
        "-i",
        input,
        "--state",
        state,
        "--rss",
        rss,
        "--ics",
        ics,
        "--out",
        out,
      ]);
      assert.equal(outputs.code, 0);
      assert.match(fs.readFileSync(rss, "utf8"), /<rss version="2\.0">/);
      assert.match(fs.readFileSync(ics, "utf8"), /BEGIN:VCALENDAR/);
      assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).length, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--rss-input digests feed items with file merge and diffing", async function () {
    var fs = require("node:fs");
    var os = require("node:os");
    var testPath = require("node:path");
    var netHttp = require("node:http");
    var feedXml =
      '<?xml version="1.0"?><rss version="2.0"><channel><title>Jobs</title>' +
      "<item><title>Feed Clerk Post 2026</title>" +
      "<link>https://site.test/feed/1</link>" +
      "<pubDate>Mon, 07 Sep 2026 10:00:00 +0530</pubDate>" +
      "<description>Clerk post from feed.</description></item>" +
      "<item><title>Feed GD Post 2026</title>" +
      "<link>https://site.test/feed/2</link></item>" +
      "</channel></rss>";
    var server = netHttp.createServer(function (req, res) {
      if (req.url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nAllow: /\n");
        return;
      }
      if (req.url === "/feed.xml") {
        res.writeHead(200, { "content-type": "application/rss+xml" });
        res.end(feedXml);
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("missing");
    });
    await new Promise(function (resolve) {
      server.listen(0, "127.0.0.1", resolve);
    });
    var dir = fs.mkdtempSync(testPath.join(os.tmpdir(), "digest-rss-"));
    try {
      var feedUrl = "http://127.0.0.1:" + server.address().port + "/feed.xml";
      var state = testPath.join(dir, "state.json");
      var base = ["--rss-input", feedUrl, "--state", state];

      var first = await run(
        "job-digest.js",
        base.concat(["--alert", "telegram"])
      );
      assert.equal(first.code, 0);
      assert.match(first.stderr, /loaded 2 job\(s\) \(2 from 1 feed\(s\)\)/);
      assert.match(first.stderr, /state initialised/);
      assert.equal(first.stdout, "");

      var again = await run(
        "job-digest.js",
        base.concat(["--alert", "telegram", "--dry-run"])
      );
      assert.equal(again.code, 0);
      assert.match(again.stderr, /no new jobs/);

      var all = await run(
        "job-digest.js",
        base.concat(["--alert", "telegram", "--dry-run", "--all"])
      );
      assert.equal(all.code, 0);
      assert.match(all.stdout, /Feed Clerk Post 2026/);
      assert.match(all.stdout, /Feed GD Post 2026/);

      var input = testPath.join(dir, "jobs.json");
      fs.writeFileSync(
        input,
        JSON.stringify([
          {
            url: "https://site.test/job/9",
            detail: [
              { key: "Name of Post", value: "Filed Post", type: "String" },
            ],
          },
        ])
      );
      var merged = await run("job-digest.js", ["-i", input].concat(base));
      assert.equal(merged.code, 0);
      assert.match(merged.stderr, /loaded 3 job\(s\) \(2 from 1 feed\(s\)\)/);
    } finally {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--rss-input rejects bad URLs and skips dead feeds", async function () {
    var bad = await run("job-digest.js", ["--rss-input", "foo"]);
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /not a valid feed URL/);

    var scheme = await run("job-digest.js", [
      "--rss-input",
      "ftp://x.test/feed",
    ]);
    assert.equal(scheme.code, 2);
    assert.match(scheme.stderr, /must use http/);

    var fs = require("node:fs");
    var os = require("node:os");
    var testPath = require("node:path");
    var dir = fs.mkdtempSync(testPath.join(os.tmpdir(), "digest-dead-"));
    try {
      // Nothing listens on this port: fetch fails, digest continues empty.
      var dead = await run("job-digest.js", [
        "--rss-input",
        "http://127.0.0.1:9/feed.xml",
        "--state",
        testPath.join(dir, "state.json"),
      ]);
      assert.equal(dead.code, 0);
      assert.match(dead.stderr, /skipping feed/);
      assert.match(dead.stderr, /loaded 0 job\(s\)/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("quarantines jobs after repeated alert failures", async function () {
    var fs = require("node:fs");
    var os = require("node:os");
    var testPath = require("node:path");
    var netHttp = require("node:http");
    var posts = 0;
    var server = netHttp.createServer(function (req, res) {
      posts += 1;
      res.writeHead(500, { "content-type": "application/json" });
      res.end("{}");
    });
    await new Promise(function (resolve) {
      server.listen(0, "127.0.0.1", resolve);
    });
    var dir = fs.mkdtempSync(testPath.join(os.tmpdir(), "digest-quar-"));
    try {
      var input = testPath.join(dir, "jobs.json");
      fs.writeFileSync(
        input,
        JSON.stringify([
          {
            url: "https://site.test/job/poison",
            detail: [{ key: "Name of Post", value: "Poison", type: "String" }],
          },
        ])
      );
      var env = {
        WEBHOOK_URL: "http://127.0.0.1:" + server.address().port + "/hook",
      };
      var args = [
        "-i",
        input,
        "--state",
        testPath.join(dir, "state.json"),
        "--alert",
        "webhook",
        "--retries",
        "0",
        "--all",
      ];
      var first = await run("job-digest.js", args, env);
      assert.equal(first.code, 1);
      assert.equal(posts, 1);
      await run("job-digest.js", args, env);
      await run("job-digest.js", args, env);
      assert.equal(posts, 3);
      var fourth = await run("job-digest.js", args, env);
      assert.equal(fourth.code, 0);
      assert.equal(posts, 3); // quarantined: no further attempts
      assert.match(fourth.stderr, /quarantined/);
    } finally {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
