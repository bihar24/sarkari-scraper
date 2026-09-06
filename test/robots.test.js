"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var httpServer = require("node:http");
var http = require("../utils/http");
var robots = require("../utils/robots");

function robotsServer(body, status) {
  var fetches = 0;
  var server = httpServer.createServer(function (req, res) {
    if (req.url === "/robots.txt") {
      fetches += 1;
      res.statusCode = status || 200;
      res.setHeader("content-type", "text/plain");
      res.end(body || "");
    } else {
      res.statusCode = 404;
      res.end("nope");
    }
  });
  return {
    fetches: function () {
      return fetches;
    },
    start: function () {
      return new Promise(function (resolve) {
        server.listen(0, "127.0.0.1", function () {
          resolve("http://127.0.0.1:" + server.address().port);
        });
      });
    },
    stop: function () {
      server.close();
    },
  };
}

function checker() {
  return robots.createRobotsChecker({
    client: http.createClient({ timeoutMs: 5000 }),
    userAgent: "sarkari-scraper/1.2 (+https://example.test)",
  });
}

describe("robots checker", function () {
  it("enforces Disallow with longest-match Allow override", async function () {
    var srv = robotsServer(
      "User-agent: *\nDisallow: /private\nAllow: /private/ok\n"
    );
    var base = await srv.start();
    try {
      var check = checker();
      var denied = await check.isAllowed(base + "/private/x?y=1");
      assert.equal(denied.allowed, false);
      var allowed = await check.isAllowed(base + "/private/ok");
      assert.equal(allowed.allowed, true);
      var pub = await check.isAllowed(base + "/public");
      assert.equal(pub.allowed, true);
    } finally {
      srv.stop();
    }
  });

  it("matches crawler-specific groups and ignores other bots' groups", async function () {
    var srv = robotsServer(
      "User-agent: otherbot\nDisallow: /\n\nUser-agent: sarkari-scraper\nDisallow: /secret\n"
    );
    var base = await srv.start();
    try {
      var check = checker();
      assert.equal((await check.isAllowed(base + "/secret")).allowed, false);
      assert.equal((await check.isAllowed(base + "/open")).allowed, true);
    } finally {
      srv.stop();
    }
  });

  it("fails open when robots.txt is missing or broken", async function () {
    var missing = robotsServer("", 404);
    var base = await missing.start();
    try {
      var verdict = await checker().isAllowed(base + "/anything");
      assert.equal(verdict.allowed, true);
    } finally {
      missing.stop();
    }

    var broken = robotsServer("boom", 500);
    var base2 = await broken.start();
    try {
      var verdict2 = await checker().isAllowed(base2 + "/anything");
      assert.equal(verdict2.allowed, true);
    } finally {
      broken.stop();
    }
  });

  it("fetches robots.txt once per origin", async function () {
    var srv = robotsServer("User-agent: *\nDisallow:\n");
    var base = await srv.start();
    try {
      var check = checker();
      await check.isAllowed(base + "/a");
      await check.isAllowed(base + "/b");
      assert.equal(srv.fetches(), 1);
    } finally {
      srv.stop();
    }
  });
});

describe("robots parsing", function () {
  it("strips comments and handles empty Disallow (allow all)", function () {
    var rules = robots.parseRobots(
      "# comment\nUser-agent: * # trailing\nDisallow: # empty\n",
      "x"
    );
    assert.deepEqual(rules.disallows, []);
    assert.equal(robots.isPathAllowed(rules, "/anything"), true);
  });

  it("Allow wins ties against Disallow", function () {
    var rules = { allows: ["/p"], disallows: ["/p"] };
    assert.equal(robots.isPathAllowed(rules, "/p/x"), true);
    assert.equal(
      robots.isPathAllowed({ allows: [], disallows: ["/p"] }, "/p/x"),
      false
    );
  });
});
