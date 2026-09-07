"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var crawl = require("../utils/crawl");

function stubClient(pages) {
  var calls = [];
  return {
    calls: calls,
    get: function (url) {
      calls.push(url);
      if (!Object.prototype.hasOwnProperty.call(pages, url)) {
        return Promise.reject(
          Object.assign(new Error("not found: " + url), {
            config: { url: url },
            request: {},
          })
        );
      }
      return Promise.resolve({
        data: pages[url],
        config: { url: url },
        request: {},
      });
    },
  };
}

describe("crawl.crawlJobList", function () {
  it("follows relative pagination links and concatenates items", async function () {
    var client = stubClient({
      "https://site.test/p1": "page-one",
      "https://site.test/p2": "page-two",
    });
    var result = await crawl.crawlJobList({
      scrapFn: function (html, pageUrl) {
        if (pageUrl.endsWith("/p1")) {
          return { data: [{ link: pageUrl + "/a" }], next: "p2" };
        }
        return { data: [{ link: pageUrl + "/b" }], next: null };
      },
      startUrl: "https://site.test/p1",
      client: client,
      maxPages: 10,
      delayMs: 0,
    });
    assert.equal(result.pages, 2);
    assert.equal(result.items.length, 2);
    assert.deepEqual(client.calls, [
      "https://site.test/p1",
      "https://site.test/p2",
    ]);
  });

  it("stops on pagination cycles instead of looping forever", async function () {
    var client = stubClient({ "https://site.test/p1": "x" });
    var result = await crawl.crawlJobList({
      scrapFn: function () {
        return {
          data: [{ link: "https://site.test/a" }],
          next: "https://site.test/p1",
        };
      },
      startUrl: "https://site.test/p1",
      client: client,
      maxPages: 50,
      delayMs: 0,
    });
    assert.equal(result.pages, 1);
    assert.equal(result.items.length, 1);
    assert.equal(client.calls.length, 1);
  });

  it("honours maxPages", async function () {
    var client = stubClient({
      "https://site.test/p0": "",
      "https://site.test/p1": "",
      "https://site.test/p2": "",
      "https://site.test/p3": "",
    });
    var n = 0;
    var result = await crawl.crawlJobList({
      scrapFn: function () {
        n += 1;
        return { data: [], next: "https://site.test/p" + n };
      },
      startUrl: "https://site.test/p0",
      client: client,
      maxPages: 3,
      delayMs: 0,
    });
    assert.equal(result.pages, 3);
    assert.equal(client.calls.length, 3);
  });

  it("ignores non-HTTP next links", async function () {
    var client = stubClient({ "https://site.test/p1": "" });
    var result = await crawl.crawlJobList({
      scrapFn: function () {
        return {
          data: [{ link: "https://site.test/a" }],
          next: "javascript:void(0)",
        };
      },
      startUrl: "https://site.test/p1",
      client: client,
      maxPages: 10,
      delayMs: 0,
    });
    assert.equal(result.pages, 1);
    assert.equal(result.items.length, 1);
  });

  it("flags block/error pages instead of returning an empty success", async function () {
    var client = stubClient({
      "https://site.test/p1":
        "<html><title>Just a moment...</title><body>Cloudflare Ray ID</body></html>",
    });
    var result = await crawl.crawlJobList({
      scrapFn: function () {
        return { data: [], next: null };
      },
      startUrl: "https://site.test/p1",
      client: client,
      maxPages: 5,
      delayMs: 0,
    });
    assert.equal(result.pages, 0);
    assert.equal(result.items.length, 0);
    assert.equal(result.blocked, true);
  });

  it("refuses to follow off-site pagination when same-site is enforced", async function () {
    var client = stubClient({ "https://site.test/p1": "" });
    var result = await crawl.crawlJobList({
      scrapFn: function () {
        return {
          data: [{ link: "https://site.test/a" }],
          next: "https://evil.test/trap",
        };
      },
      startUrl: "https://site.test/p1",
      client: client,
      maxPages: 10,
      delayMs: 0,
      sameSiteDomain: "site.test",
    });
    assert.equal(result.pages, 1);
    assert.deepEqual(client.calls, ["https://site.test/p1"]);
  });
});
