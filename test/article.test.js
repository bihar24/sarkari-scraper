"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var article = require("../utils/article");

describe("article.extractArticle", function () {
  var html =
    "<html><head><title>Job page</title></head><body>" +
    "<article><h1>UPSC Clerk Recruitment 2026</h1>" +
    "<h2>Vacancy Details</h2>" +
    "<table><tr><th>Post</th><th>Posts</th></tr>" +
    "<tr><td>Clerk</td><td>500</td></tr></table>" +
    "<h2>Age Limit</h2>" +
    "<ul><li>Minimum 18 years</li><li>Maximum 27 years</li></ul>" +
    "<h2>Important Links</h2>" +
    '<p><a href="/apply">Apply Online</a> <a href="/notice.pdf">Notice PDF</a></p>' +
    "<h2>How to Apply</h2>" +
    "<p>Visit the official website and fill the long application form carefully.</p>" +
    "</article></body></html>";

  it("extracts title plus headed sections as typed records", function () {
    var data = article.extractArticle(html, "https://site.test/job/1");
    var keys = data.map(function (row) {
      return row.key;
    });
    assert.deepEqual(keys, [
      "Post Link",
      "Title",
      "Vacancy Details",
      "Age Limit",
      "Important Links",
      "How to Apply",
    ]);
    assert.equal(data[1].value, "UPSC Clerk Recruitment 2026");
    assert.equal(data[2].type, "Table");
    assert.equal(data[2].value[1][0].value, "Clerk");
    assert.equal(data[3].type, "List");
    assert.deepEqual(data[3].value, ["Minimum 18 years", "Maximum 27 years"]);
    assert.equal(data[4].type, "Link");
    assert.equal(data[4].value[0].link, "https://site.test/apply");
    assert.equal(data[5].type, "Paragraph");
  });

  it("falls back gracefully on thin pages", function () {
    var data = article.extractArticle(
      "<html><body><p>Nothing much here</p></body></html>",
      "https://x.test/a"
    );
    assert.equal(data[0].key, "Post Link");
    assert.ok(data.length >= 1);
  });
});
