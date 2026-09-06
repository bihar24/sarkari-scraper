"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var cheerio = require("cheerio");
var helper = require("../utils/helper");

describe("helper.formatString", function () {
  it("collapses inner whitespace and trims", function () {
    assert.equal(helper.formatString("  Post   Name\n\tX  "), "Post Name X");
  });

  it("returns null for empty/missing input", function () {
    assert.equal(helper.formatString(""), null);
    assert.equal(helper.formatString("   "), null);
    assert.equal(helper.formatString(null), null);
    assert.equal(helper.formatString(undefined), null);
  });
});

describe("helper.formatKey", function () {
  it("removes ALL colons, not just the first", function () {
    assert.equal(helper.formatKey("Post Date: Updated:"), "Post Date Updated");
  });

  it("returns null for empty/missing input", function () {
    assert.equal(helper.formatKey(null), null);
    assert.equal(helper.formatKey("  "), null);
  });
});

describe("helper.isObjectEmpty", function () {
  it("keeps its legacy key-based semantics", function () {
    assert.equal(helper.isObjectEmpty({}), true);
    assert.equal(helper.isObjectEmpty({ a: 1 }), false);
  });
});

describe("helper.isDataEmpty", function () {
  it("treats key-less, value-less records as empty", function () {
    assert.equal(helper.isDataEmpty({}), true);
    assert.equal(helper.isDataEmpty(null), true);
    assert.equal(
      helper.isDataEmpty({ key: null, value: null, type: "String" }),
      true
    );
    assert.equal(helper.isDataEmpty({ key: "K", value: [] }), false);
    assert.equal(helper.isDataEmpty({ value: "" }), true);
    assert.equal(helper.isDataEmpty({ value: ["x"] }), false);
    assert.equal(helper.isDataEmpty({ key: "Only key" }), false);
  });
});

describe("helper.formatLink", function () {
  it("resolves relative hrefs against the page URL", function () {
    assert.equal(
      helper.formatLink("https://x.com/dir/page", "/abs"),
      "https://x.com/abs"
    );
    assert.equal(
      helper.formatLink("https://x.com/dir/page", "rel"),
      "https://x.com/dir/rel"
    );
    assert.equal(
      helper.formatLink("https://x.com/dir/page", "https://other.com/y?a=1"),
      "https://other.com/y?a=1"
    );
  });

  it("falls back to the raw href without a base URL", function () {
    assert.equal(helper.formatLink(undefined, "/a"), "/a");
    assert.equal(helper.formatLink(null, null), null);
  });
});

describe("helper.tagName", function () {
  it("returns the upper-cased tag name", function () {
    var $ = cheerio.load("<div><h2>x</h2><TABLE></TABLE></div>");
    assert.equal(helper.tagName($, $("h2").get(0)), "H2");
    assert.equal(helper.tagName($, $("table").get(0)), "TABLE");
    assert.equal(helper.tagName($, null), "");
  });
});

describe("helper.isHttpUrl", function () {
  it("accepts only http(s) URLs", function () {
    assert.equal(helper.isHttpUrl("https://x.com/a"), true);
    assert.equal(helper.isHttpUrl("http://x.com/a"), true);
    assert.equal(helper.isHttpUrl("javascript:void(0)"), false);
    assert.equal(helper.isHttpUrl("mailto:a@b.c"), false);
    assert.equal(helper.isHttpUrl("/relative"), false);
    assert.equal(helper.isHttpUrl(null), false);
  });
});

describe("helper.isSameSite", function () {
  it("matches the domain and its subdomains only", function () {
    assert.equal(helper.isSameSite("https://x.com/a", "x.com"), true);
    assert.equal(helper.isSameSite("https://sub.x.com/a", "x.com"), true);
    assert.equal(helper.isSameSite("https://www.x.com/a", "x.com"), true);
    assert.equal(helper.isSameSite("https://x.com.evil.com/a", "x.com"), false);
    assert.equal(helper.isSameSite("https://evil.com/a", "x.com"), false);
    assert.equal(helper.isSameSite("https://X.COM/a", "x.com"), true);
    assert.equal(helper.isSameSite("/relative", "x.com"), false);
    assert.equal(helper.isSameSite(null, "x.com"), false);
  });
});
