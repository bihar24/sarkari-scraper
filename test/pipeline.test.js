"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var httpServer = require("node:http");
var http = require("../utils/http");
var crawl = require("../utils/crawl");
var csv = require("../utils/csv");
var jobList = require("../scripts/sarkariexam.com/job-list");
var jobDetail = require("../scripts/sarkariexam.com/job-detail");

function detailHtml(title) {
  return (
    '<div class="newpage-row2"><div>Post Last Updates : 01-Jan-2021</div>' +
    "<table>" +
    "<tr><td><h1>" +
    title +
    "</h1></td></tr>" +
    "<tr><td><h3>Fees</h3><ul><li>Rs 100</li></ul></td></tr>" +
    "</table></div>"
  );
}

describe("end-to-end pipeline (local HTTP server, real axios client)", function () {
  it("crawls list pages, scrapes details and emits valid JSON + CSV", async function () {
    var server = httpServer.createServer(function (req, res) {
      res.setHeader("content-type", "text/html");
      if (req.url === "/list") {
        res.end(
          '<div class="category-typepost"><div><ul>' +
            "<h3>Latest Form Issued on 12-Feb-2020</h3>" +
            '<li><a href="/job/1">Job A</a></li>' +
            '<li><a href="/job/2">Job B</a></li>' +
            "</ul></div></div>" +
            '<a class="nextpostslink" href="/list2">Next</a>'
        );
      } else if (req.url === "/list2") {
        res.end(
          '<div class="category-typepost"><div><ul>' +
            '<li><a href="/job/3">Job C</a></li>' +
            "</ul></div></div>"
        );
      } else if (req.url === "/job/1") {
        res.end(detailHtml("Job A"));
      } else if (req.url === "/job/2") {
        res.end(detailHtml("Job B"));
      } else if (req.url === "/job/3") {
        res.statusCode = 500;
        res.end("boom");
      } else {
        res.statusCode = 404;
        res.end("nope");
      }
    });
    await new Promise(function (resolve) {
      server.listen(0, "127.0.0.1", resolve);
    });
    var base = "http://127.0.0.1:" + server.address().port;

    try {
      var client = http.createClient({ timeoutMs: 5000 });

      // Phase 1: crawl (follows /list -> /list2).
      var result = await crawl.crawlJobList({
        scrapFn: jobList.scrapJobList,
        startUrl: base + "/list",
        client: client,
        maxPages: 10,
        delayMs: 0,
      });
      assert.equal(result.pages, 2);
      assert.equal(result.items.length, 3);
      assert.equal(result.items[0].link, base + "/job/1");
      assert.equal(result.items[0].date, "12-Feb-2020");

      // Phase 2: scrape details (job 3 fails with HTTP 500).
      var jobs = [];
      for (var i = 0; i < result.items.length; i++) {
        var url = result.items[i].link;
        try {
          var response = await client.get(url);
          jobs.push({
            url: http.finalUrl(response) || url,
            detail: jobDetail.scrapJobDetail(response.data, url),
          });
        } catch (err) {
          jobs.push({ url: url, detail: null, error: http.describeError(err) });
        }
      }
      assert.equal(jobs.length, 3);
      assert.ok(jobs[0].detail.length > 1);
      assert.equal(jobs[0].detail[0].key, "Post Link");
      assert.match(jobs[2].error, /HTTP 500/);

      // Phase 3a: JSON output parses back.
      var json = JSON.stringify(jobs, null, 2);
      assert.equal(JSON.parse(json).length, 3);

      // Phase 3b: CSV output has a single header row.
      var rows = [];
      jobs.forEach(function (job) {
        if (job.error) {
          rows.push({ sourceUrl: job.url, error: job.error });
        } else {
          csv.formatData(job.detail).forEach(function (record) {
            rows.push(Object.assign({ sourceUrl: job.url }, record));
          });
        }
      });
      var text = csv.parse(rows);
      var header = text.split("\n")[0];
      assert.match(header, /sourceUrl/);
      assert.equal(
        text.split("\n").filter(function (line) {
          return line === header;
        }).length,
        1
      );
    } finally {
      server.close();
    }
  });
});
