"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var http = require("node:http");
var feed = require("../utils/feed");
var httpClient = require("../utils/http");

var RSS_XML =
  '<?xml version="1.0"?>' +
  '<rss version="2.0"><channel><title>Jobs</title>' +
  "<item><title>UPSC Clerk 500 Posts 2026</title>" +
  "<link>https://site.test/jobs/1</link>" +
  "<pubDate>Mon, 07 Sep 2026 10:00:00 +0530</pubDate>" +
  "<description><![CDATA[<p>Apply online for <b>500</b> clerk posts.</p>]]></description>" +
  "<category>UPSC</category><category>Clerk</category></item>" +
  "<item><title>No link item</title></item>" +
  "</channel></rss>";

var ATOM_XML =
  '<?xml version="1.0"?>' +
  '<feed xmlns="http://www.w3.org/2005/Atom"><title>Jobs</title>' +
  "<entry><title>SSC GD Constable 2026</title>" +
  '<link href="https://site.test/jobs/2" rel="alternate"/>' +
  "<updated>2026-09-06T08:00:00Z</updated>" +
  '<summary type="html">&lt;p&gt;Constable recruitment.&lt;/p&gt;</summary>' +
  '<category term="ssc" label="SSC"/></entry>' +
  "</feed>";

describe("feed.parseFeedXml", function () {
  it("parses RSS 2.0 items and strips HTML descriptions", function () {
    var parsed = feed.parseFeedXml(RSS_XML);
    assert.equal(parsed.format, "rss");
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0].title, "UPSC Clerk 500 Posts 2026");
    assert.equal(parsed.items[0].link, "https://site.test/jobs/1");
    assert.equal(parsed.items[0].published, "Mon, 07 Sep 2026 10:00:00 +0530");
    assert.equal(parsed.items[0].summary, "Apply online for 500 clerk posts.");
    assert.deepEqual(parsed.items[0].categories, ["UPSC", "Clerk"]);
    assert.equal(parsed.items[1].link, null);
  });

  it("parses Atom entries with href links and term categories", function () {
    var parsed = feed.parseFeedXml(ATOM_XML);
    assert.equal(parsed.format, "atom");
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].title, "SSC GD Constable 2026");
    assert.equal(parsed.items[0].link, "https://site.test/jobs/2");
    assert.equal(parsed.items[0].published, "2026-09-06T08:00:00Z");
    assert.equal(parsed.items[0].summary, "Constable recruitment.");
    assert.deepEqual(parsed.items[0].categories, ["SSC"]);
  });

  it("parses RDF feeds and rejects non-feeds", function () {
    var rdf =
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      "<item><title>Old post</title><link>https://site.test/old</link></item>" +
      "</rdf:RDF>";
    var parsed = feed.parseFeedXml(rdf);
    assert.equal(parsed.format, "rss");
    assert.equal(parsed.items[0].link, "https://site.test/old");
    assert.deepEqual(feed.parseFeedXml("<html><body>nope</body></html>"), {
      format: null,
      items: [],
    });
    assert.deepEqual(feed.parseFeedXml(""), { format: null, items: [] });
  });
});

describe("feed.itemsToJobs", function () {
  it("builds digest jobs and skips link-less items", function () {
    var parsed = feed.parseFeedXml(RSS_XML);
    var converted = feed.itemsToJobs(parsed.items);
    assert.equal(converted.jobs.length, 1);
    assert.equal(converted.skipped, 1);
    var job = converted.jobs[0];
    assert.equal(job.url, "https://site.test/jobs/1");
    assert.deepEqual(
      job.detail.map(function (row) {
        return row.key;
      }),
      ["Post Link", "Title", "Published", "Summary", "Categories"]
    );
    assert.equal(
      converted.jobs[0].detail[1].value,
      "UPSC Clerk 500 Posts 2026"
    );
  });
});

describe("feed.fetchFeed", function () {
  function serve(routes) {
    var server = http.createServer(function (req, res) {
      var body = routes[req.url];
      if (body === undefined) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("missing");
        return;
      }
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end(body);
    });
    return new Promise(function (resolve) {
      server.listen(0, "127.0.0.1", function () {
        resolve(server);
      });
    });
  }

  it("fetches and converts a feed; rejects non-feeds", async function () {
    var server = await serve({ "/feed.xml": RSS_XML, "/page": "<p>hi</p>" });
    var base = "http://127.0.0.1:" + server.address().port;
    var client = httpClient.createClient({ timeoutMs: 5000 });
    try {
      var converted = await feed.fetchFeed(client, base + "/feed.xml");
      assert.equal(converted.jobs.length, 1);
      assert.equal(converted.jobs[0].url, "https://site.test/jobs/1");
      await assert.rejects(
        feed.fetchFeed(client, base + "/page"),
        /not a recognized RSS\/Atom feed/
      );
    } finally {
      server.close();
    }
  });
});
