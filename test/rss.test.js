"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var rss = require("../utils/rss");

describe("rss.buildRss", function () {
  it("builds an RSS 2.0 feed with escaped items", function () {
    var feed = rss.buildRss({
      title: "Sarkari digest",
      link: "https://example.test/feed",
      description: "New & hot <jobs>",
      items: [
        {
          title: "Clerk <UPSC>",
          link: "https://example.test/job/1",
          guid: "job-1",
          description: "100 posts & more",
          pubDate: new Date(Date.UTC(2026, 0, 1)),
        },
      ],
    });
    assert.match(feed, /<rss version="2\.0">/);
    assert.match(feed, /<title>Clerk &lt;UPSC&gt;<\/title>/);
    assert.match(feed, /New &amp; hot &lt;jobs&gt;/);
    assert.match(feed, /<guid isPermaLink="false">job-1<\/guid>/);
    assert.match(feed, /<pubDate>Thu, 01 Jan 2026 /);
  });

  it("survives empty channels", function () {
    var feed = rss.buildRss({});
    assert.match(feed, /<channel>/);
    assert.doesNotMatch(feed, /<item>/);
  });
});
