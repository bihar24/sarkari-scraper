"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var httpServer = require("node:http");
var http = require("../utils/http");
var enrich = require("../utils/enrich");

function stubServer() {
  var server = httpServer.createServer(function (req, res) {
    var url = new URL(req.url, "http://stub");
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/mymemory/get") {
      if (url.searchParams.get("q") === "quota") {
        res.end(
          JSON.stringify({
            responseData: { translatedText: "QUERY LENGTH LIMIT EXCEEDED" },
            responseStatus: "429",
          })
        );
      } else {
        res.end(
          JSON.stringify({
            responseData: { translatedText: "क्लर्क", match: 1 },
            responseStatus: "200",
          })
        );
      }
    } else if (url.pathname.startsWith("/pollinations/")) {
      res.setHeader("content-type", "text/plain");
      res.end("UPSC Clerk, 100 posts. Last date 15-Aug-2026.");
    } else if (url.pathname === "/pincode/110006") {
      res.end(
        JSON.stringify([
          {
            Message: "ok",
            Status: "Success",
            PostOffice: [
              {
                Name: "Delhi G.P.O.",
                District: "Central Delhi",
                State: "DELHI",
              },
            ],
          },
        ])
      );
    } else if (url.pathname === "/pincode/999999") {
      res.end(JSON.stringify([{ Message: "No records", Status: "Error" }]));
    } else if (url.pathname === "/nager/api/v3/publicholidays/2026/IN") {
      res.end(
        JSON.stringify([
          {
            date: "2026-08-15",
            name: "Independence Day",
            localName: "Independence Day",
          },
        ])
      );
    } else if (url.pathname.startsWith("/wayback/save/")) {
      res.statusCode = 302;
      res.setHeader("location", "/wayback/web/20260101000000/http://x/job");
      res.end();
    } else if (url.pathname.startsWith("/wayback/web/")) {
      res.setHeader("content-type", "text/html");
      res.end("archived");
    } else if (url.pathname === "/cleanuri/api/v1/shorten") {
      req.resume();
      req.on("end", function () {
        res.end(JSON.stringify({ result_url: "https://cleanuri.com/abc123" }));
      });
    } else if (url.pathname === "/catbox/user/api.php") {
      req.resume();
      req.on("end", function () {
        res.setHeader("content-type", "text/plain");
        res.end("https://files.catbox.moe/ab12cd.json");
      });
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  return {
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

describe("enrich integrations (stub servers)", function () {
  it("translates, summarizes, locates, fetches holidays, archives, shortens, uploads", async function () {
    var srv = stubServer();
    var base = await srv.start();
    try {
      var client = http.createClient({ timeoutMs: 5000 });

      assert.equal(
        await enrich.translateText(client, "Clerk", "hi", {
          baseUrl: base + "/mymemory",
        }),
        "क्लर्क"
      );
      assert.equal(
        await enrich.translateText(client, "quota", "hi", {
          baseUrl: base + "/mymemory",
        }),
        null
      );
      assert.equal(
        await enrich.translateText(client, "x", "xx-invalid!", {
          baseUrl: base + "/mymemory",
        }),
        null
      );

      assert.match(
        await enrich.summarizeJob(client, "UPSC Clerk 100 posts", {
          baseUrl: base + "/pollinations",
        }),
        /UPSC Clerk/
      );

      assert.deepEqual(
        await enrich.lookupPincode(client, "110006", { baseUrl: base }),
        { pin: "110006", district: "Central Delhi", state: "DELHI", offices: 1 }
      );
      assert.equal(
        await enrich.lookupPincode(client, "999999", { baseUrl: base }),
        null
      );
      assert.equal(
        await enrich.lookupPincode(client, "123", { baseUrl: base }),
        null
      );

      assert.deepEqual(
        await enrich.fetchHolidays(client, 2026, "IN", {
          baseUrl: base + "/nager",
        }),
        [
          {
            date: "2026-08-15",
            name: "Independence Day",
            localName: "Independence Day",
          },
        ]
      );

      var snapshot = await enrich.archivePage(client, "http://x/job", {
        baseUrl: base + "/wayback",
      });
      assert.match(snapshot, /\/web\/20260101000000\//);

      assert.equal(
        await enrich.shortenUrl(client, "https://example.test/long", {
          baseUrl: base + "/cleanuri",
        }),
        "https://cleanuri.com/abc123"
      );

      var dir = fs.mkdtempSync(path.join(os.tmpdir(), "enrich-"));
      var file = path.join(dir, "d.json");
      fs.writeFileSync(file, '{"a":1}');
      assert.equal(
        await enrich.uploadFile(client, file, { baseUrl: base + "/catbox" }),
        "https://files.catbox.moe/ab12cd.json"
      );
      fs.rmSync(dir, { recursive: true, force: true });
    } finally {
      srv.stop();
    }
  });

  it("fails soft (null) when services are unreachable", async function () {
    var client = http.createClient({ timeoutMs: 1000 });
    var dead = { baseUrl: "http://127.0.0.1:9" };
    assert.equal(await enrich.translateText(client, "x", "hi", dead), null);
    assert.equal(await enrich.summarizeJob(client, "x", dead), null);
    assert.equal(await enrich.lookupPincode(client, "110006", dead), null);
    assert.equal(await enrich.fetchHolidays(client, 2026, "IN", dead), null);
    assert.equal(await enrich.archivePage(client, "http://x", dead), null);
    assert.equal(await enrich.shortenUrl(client, "http://x", dead), null);
  });
});
