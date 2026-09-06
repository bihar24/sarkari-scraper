"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var notifydb = require("../utils/notifydb");

function tempDb() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "notifydb-"));
  return {
    dir: dir,
    file: path.join(dir, "notes.db"),
    cleanup: function () {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("utils/notifydb", function () {
  it("records and finds notifications exactly", async function () {
    var tmp = tempDb();
    try {
      var db = await notifydb.openNotifyDb(tmp.file);
      assert.equal(db.notified("https://site.test/a"), false);
      db.record({ url: "https://site.test/a", title: "Post A" });
      db.record({
        url: "https://site.test/b",
        title: "Post B",
        payload: { via: "test" },
      });
      assert.equal(db.notified("https://site.test/a"), true);
      assert.equal(db.notified("https://site.test/zzz"), false);
      var row = db.get("https://site.test/a");
      assert.equal(row.title, "Post A");
      assert.equal(row.source, "site.test");
      assert.ok(row.first_seen);
      db.close();

      var reopened = await notifydb.openNotifyDb(tmp.file);
      assert.equal(reopened.notified("https://site.test/a"), true);
      assert.equal(reopened.notified("https://site.test/b"), true);
      assert.equal(reopened.recent(10).length, 2);
      var stats = reopened.stats();
      assert.equal(stats.count, 2);
      assert.equal(stats.sources[0].source, "site.test");
      assert.equal(stats.bloom.count, 2);
      assert.ok(stats.bloom.fpRate >= 0);
      reopened.close();
    } finally {
      tmp.cleanup();
    }
  });

  it("re-recording refreshes last_seen, keeps first_seen", async function () {
    var tmp = tempDb();
    try {
      var db = await notifydb.openNotifyDb(tmp.file);
      db.record({ url: "https://site.test/a", title: "Old title" });
      var before = db.get("https://site.test/a");
      await new Promise(function (resolve) {
        setTimeout(resolve, 5);
      });
      db.record({ url: "https://site.test/a", title: "New title" });
      var after = db.get("https://site.test/a");
      assert.equal(after.title, "New title");
      assert.equal(after.first_seen, before.first_seen);
      assert.ok(after.last_seen >= before.last_seen);
      assert.equal(db.stats().count, 1);
      db.close();
    } finally {
      tmp.cleanup();
    }
  });

  it("rejects corrupt database files", async function () {
    var tmp = tempDb();
    try {
      fs.writeFileSync(tmp.file, "this is not sqlite");
      await assert.rejects(
        notifydb.openNotifyDb(tmp.file),
        /cannot open database/
      );
    } finally {
      tmp.cleanup();
    }
  });
});

describe("tools/notify-db queries", function () {
  var execFile = require("node:child_process").execFile;
  var TOOL = path.join(__dirname, "..", "tools", "notify-db.js");

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

  it("--stats/--check/--recent/--export read the archive", async function () {
    var tmp = tempDb();
    try {
      var db = await notifydb.openNotifyDb(tmp.file);
      db.record({ url: "https://site.test/a", title: "Post A" });
      db.record({ url: "https://site.test/b", title: "Post B" });
      db.close();

      var stats = await run(["--db", tmp.file, "--stats"]);
      assert.equal(stats.code, 0);
      assert.match(stats.stdout, /notifications: 2/);
      assert.match(stats.stdout, /bloom: 2 keys/);

      var hit = await run(["--db", tmp.file, "--check", "https://site.test/a"]);
      assert.equal(hit.code, 0);
      assert.match(hit.stdout, /NOTIFIED Post A/);

      var miss = await run([
        "--db",
        tmp.file,
        "--check",
        "https://site.test/zzz",
      ]);
      assert.equal(miss.code, 0);
      assert.match(miss.stdout, /NEW https:\/\/site\.test\/zzz/);

      var recent = await run(["--db", tmp.file, "--recent", "1"]);
      assert.equal(recent.code, 0);
      assert.equal(recent.stdout.trim().split("\n").length, 1);

      var outFile = path.join(tmp.dir, "export.json");
      var exported = await run(["--db", tmp.file, "--export", outFile]);
      assert.equal(exported.code, 0);
      assert.equal(JSON.parse(fs.readFileSync(outFile, "utf8")).length, 2);

      var noDb = await run(["--recent"]);
      assert.equal(noDb.code, 2);
      var noFile = await run(["--db", path.join(tmp.dir, "nope.db")]);
      assert.equal(noFile.code, 2);
    } finally {
      tmp.cleanup();
    }
  });

  it("--prune forgets old notifications", async function () {
    var tmp = tempDb();
    try {
      var db = await notifydb.openNotifyDb(tmp.file);
      db.record({ url: "https://site.test/a", title: "Post A" });
      db.close();
      var kept = await run(["--db", tmp.file, "--prune", "30"]);
      assert.equal(kept.code, 0);
      assert.match(kept.stdout, /pruned 0 notification/);
      var pruned = await run(["--db", tmp.file, "--prune", "0"]);
      assert.equal(pruned.code, 0);
      assert.match(pruned.stdout, /pruned 1 notification/);
      var bad = await run(["--db", tmp.file, "--prune", "soon"]);
      assert.equal(bad.code, 2);
    } finally {
      tmp.cleanup();
    }
  });
});

describe("job-digest --db end to end", function () {
  var execFile = require("node:child_process").execFile;
  var nodeHttp = require("node:http");
  var DIGEST = path.join(__dirname, "..", "job-digest.js");

  it("records sent alerts and backstops state loss", async function () {
    var posts = 0;
    var server = nodeHttp.createServer(function (req, res) {
      if (req.method === "POST") {
        posts += 1;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    await new Promise(function (resolve) {
      server.listen(0, "127.0.0.1", resolve);
    });
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-db-"));
    try {
      var input = path.join(dir, "jobs.json");
      var state = path.join(dir, "state.json");
      var dbFile = path.join(dir, "notes.db");
      fs.writeFileSync(
        input,
        JSON.stringify([
          {
            url: "https://site.test/job/1",
            detail: [{ key: "Name of Post", value: "DB Post", type: "String" }],
          },
        ])
      );
      var env = {
        WEBHOOK_URL: "http://127.0.0.1:" + server.address().port + "/hook",
      };
      function digest(args) {
        return new Promise(function (resolve) {
          execFile(
            process.execPath,
            [DIGEST].concat(args),
            { timeout: 60000, env: Object.assign({}, process.env, env) },
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
      var base = [
        "-i",
        input,
        "--state",
        state,
        "--alert",
        "webhook",
        "--db",
        dbFile,
      ];

      var first = await digest(base.concat(["--all"]));
      assert.equal(first.code, 0);
      assert.equal(posts, 1);
      assert.match(first.stderr, /recorded 1 notified job/);
      var db = await notifydb.openNotifyDb(dbFile);
      assert.equal(db.stats().count, 1);
      assert.equal(db.get("https://site.test/job/1").title, "DB Post");
      db.close();

      var again = await digest(base);
      assert.equal(again.code, 0);
      assert.equal(posts, 1); // state says seen: no re-alert

      fs.rmSync(state); // simulate state loss
      var lost = await digest(base);
      assert.equal(lost.code, 0);
      assert.equal(posts, 1); // db backstop: still no re-alert
      assert.match(lost.stderr, /db backstop skipped 1/);

      var rebroadcast = await digest(base.concat(["--all"]));
      assert.equal(rebroadcast.code, 0);
      assert.equal(posts, 2); // --all overrides the backstop
      var reopened = await notifydb.openNotifyDb(dbFile);
      assert.equal(reopened.stats().count, 1); // re-record, no duplicate
      reopened.close();
    } finally {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
