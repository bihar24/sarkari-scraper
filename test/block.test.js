"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var block = require("../utils/block");

describe("block-page detection", function () {
  it("recognises Cloudflare/anti-bot/parked pages", function () {
    [
      "<html><title>404 Not Found</title><body>Oops! That page can't be found.</body></html>",
      "<html><title>Just a moment...</title><body>Cloudflare Ray ID</body></html>",
      "<html><title>This website is for sale!</title><body>Resources and Information</body></html>",
      "<html><body>Access Denied</body></html>",
    ].forEach(function (html) {
      assert.equal(block.looksLikeBlockPage(html), true, html);
    });
  });

  it("does not classify ordinary job content as a block page", function () {
    [
      "<html><body><ul><li>Railway RRB Group D Answer Key 2026</li></ul></body></html>",
      "<html><body><h1>Government Jobs 2026</h1><p>Apply online</p></body></html>",
    ].forEach(function (html) {
      assert.equal(block.looksLikeBlockPage(html), false, html);
    });
  });

  it("rejects navigation, social and placeholder links", function () {
    assert.equal(
      block.looksLikeNavigation({}, "About Us", "https://site.test/about-us/"),
      true
    );
    assert.equal(
      block.looksLikeNavigation({}, "Get updates", "https://twitter.com/site"),
      true
    );
    assert.equal(
      block.looksLikeNavigation(
        {},
        "SSC Junior Engineer Online Form 2026",
        "https://site.test/ssc-je-2026/"
      ),
      false
    );
  });
});
