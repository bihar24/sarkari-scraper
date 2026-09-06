"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");

var sarkariresult = require("../scripts/sarkariresult.com/job-detail");
var resultsInfo = require("../scripts/sarkariresults.info/job-detail");
var sarkariexam = require("../scripts/sarkariexam.com/job-detail");
var freshersnow = require("../scripts/freshersnow.com/job-detail");

describe("mergeKeyValue", function () {
  [sarkariresult, resultsInfo].forEach(function (mod, idx) {
    var name = idx === 0 ? "sarkariresult.com" : "sarkariresults.info";
    var merge = mod.__internals.mergeKeyValue;

    it(name + ": never drops the last element", function () {
      var input = [
        { key: "a", value: "1", type: "String" },
        { key: "b", value: "2", type: "String" },
      ];
      assert.deepEqual(merge(input, "TRIGGER"), input);
    });

    it(name + ": merges label + value, keeping the label's key", function () {
      var link = { text: "Online", link: "https://x.com/a" };
      var out = merge(
        [
          { key: "TRIGGER" },
          { key: "Apply Link" },
          { value: [link], type: "Link" },
        ],
        "TRIGGER"
      );
      assert.equal(out.length, 2);
      assert.equal(out[1].key, "Apply Link");
      assert.equal(out[1].type, "Link");
      assert.deepEqual(out[1].value, [link]);
    });

    it(name + ": merges a title with the table that follows it", function () {
      var out = merge(
        [
          { key: "Vacancy" },
          { value: [[{ value: "x", type: "String" }]], type: "Table" },
        ],
        "TRIGGER"
      );
      assert.equal(out.length, 1);
      assert.equal(out[0].key, "Vacancy");
      assert.equal(out[0].type, "Table");
    });
  });
});

describe("sarkariresult.com job-detail", function () {
  var html =
    '<div align="left"><table>' +
    "<tr><td>Name of Post:</td><td> Clerk </td></tr>" +
    "<tr><td></td><td></td></tr>" +
    "</table></div>" +
    '<div align="left"><table>' +
    "<tr><td><span>Header One</span><span>Header Two</span></td></tr>" +
    "<tr><td><span>Age Limit</span><ul><li>Min 18</li><li>Max 27</li></ul></td></tr>" +
    "</table></div>";

  it("extracts short rows, header and sections; skips empty rows", function () {
    var url = "https://www.sarkariresult.com/job/1";
    var data = sarkariresult.scrapJobDetail(html, url);
    assert.equal(data.length, 4);
    assert.equal(data[0].key, "Post Link");
    assert.equal(data[0].value[0].link, url);
    assert.deepEqual(
      { key: data[1].key, value: data[1].value, type: data[1].type },
      { key: "Name of Post", value: "Clerk", type: "String" }
    );
    assert.deepEqual(data[2].value, ["Header One", "Header Two"]);
    assert.equal(data[3].key, "Age Limit");
    assert.deepEqual(data[3].value, ["Min 18", "Max 27"]);
  });
});

describe("sarkariexam.com job-detail", function () {
  var html =
    '<div class="newpage-row2"><div>Post Last Updates : 05-May-2020</div>' +
    "<table>" +
    "<tr><td><h1>Title</h1><h4>Sub</h4></td></tr>" +
    "<tr><td><h3>Fees</h3><ul><li>Rs 100</li></ul></td></tr>" +
    '<tr><td><h3>Links</h3><a href="/apply">Apply</a></td></tr>' +
    "</table></div>";

  it("parses without ReferenceError and resolves links", function () {
    var url = "https://www.sarkariexam.com/post/9";
    var data = sarkariexam.scrapJobDetail(html, url);
    assert.ok(data.length >= 4);
    assert.equal(data[1].key, "Post Last Updates");
    assert.equal(data[1].value, "05-May-2020");
    var links = data.find(function (row) {
      return row.key === "Links";
    });
    assert.equal(links.value[0].link, "https://www.sarkariexam.com/apply");
  });
});

describe("freshersnow.com job-detail", function () {
  var html =
    '<div class="td-post-content">' +
    "<h2>Vacancy Details:</h2><ul><li>100 posts</li></ul>" +
    "<h3>Links</h3>" +
    '<table><tr><td><a href="/apply">Apply</a></td></tr></table>' +
    "</div>";

  it("pairs headings with the following section", function () {
    var url = "https://www.freshersnow.com/job/5";
    var data = freshersnow.scrapJobDetail(html, url);
    assert.equal(data.length, 3);
    assert.equal(data[1].key, "Vacancy Details");
    assert.deepEqual(data[1].value, ["100 posts"]);
    assert.equal(data[2].key, "Links");
    assert.equal(data[2].type, "Table");
    assert.equal(
      data[2].value[0][0].value[0].link,
      "https://www.freshersnow.com/apply"
    );
  });
});

describe("sarkariresults.info job-detail", function () {
  // The parser mirrors the site's deeply nested table layout; rebuild the
  // exact ancestor chain so the scope selector matches like the live page.
  function wrapInfoTables(inner) {
    var open =
      '<div class="pageContent"><table><tbody><tr><td><div>' +
      "<h2><table><tbody><tr><td><div>" +
      "<table><tbody><tr><td><div>" +
      "<table><tbody><tr><td><div>" +
      "<table><tbody><tr><td><div>" +
      "<table><tbody><tr><td><div>";
    var closeLevel = "</div></td></tr></tbody></table>";
    var close =
      closeLevel.repeat(5) + "</h2></div></td></tr></tbody></table></div>";
    return open + inner + close;
  }

  var html = wrapInfoTables(
    "<table><tbody>" +
      "<tr><td>Name of Post:</td><td> Clerk </td></tr>" +
      "<tr><td>Department:</td><td>UPSC</td></tr>" +
      "<tr><td></td><td></td></tr>" +
      "</tbody></table>" +
      "<table><tbody>" +
      "<tr><td><span>UPSC</span><span>Advt 5/2026</span></td></tr>" +
      "<tr><td><span>Age Limit</span><ul><li>Min 18 years</li><li>Max 27 years</li><li></li></ul></td></tr>" +
      "<tr><td>IMPORTANT LINKS</td></tr>" +
      "<tr><td><span>Apply Links</span></td></tr>" +
      '<tr><td><a href="/apply">Apply Online</a> <a href="https://x.test/notice.pdf">Notice</a></td></tr>' +
      "<tr><td><span>Vacancy Details</span></td></tr>" +
      '<tr><td rowspan="2">Post</td><td>UR</td><td>OBC</td></tr>' +
      '<tr><td>Clerk</td><td colspan="2">100</td><td>50</td></tr>' +
      "</tbody></table>"
  );

  it("extracts short rows, header, sections, links and merged tables", function () {
    var data = resultsInfo.scrapJobDetail(html, "https://site.test/job/1");
    assert.deepEqual(
      data.map(function (row) {
        return row.key;
      }),
      [
        "Post Link",
        "Name of Post",
        "Department",
        "Header",
        "Age Limit",
        "IMPORTANT LINKS",
        "Apply Links",
        "Vacancy Details",
      ]
    );
    assert.equal(data[1].value, "Clerk");
    assert.equal(data[1].type, "String");
    assert.deepEqual(data[3].value, ["UPSC", "Advt 5/2026"]);
    assert.deepEqual(data[4].value, ["Min 18 years", "Max 27 years"]);
    assert.equal(data[6].type, "Link");
    assert.equal(data[6].value[0].link, "https://site.test/apply");
    assert.equal(data[6].value[1].link, "https://x.test/notice.pdf");
    assert.equal(data[7].type, "Table");
    assert.equal(data[7].value[0][0].value, "Post");
    assert.equal(data[7].value[0][0].rowspan, "2");
    assert.equal(data[7].value[1][1].value, "100");
    assert.equal(data[7].value[1][1].colspan, "2");
    assert.equal(resultsInfo.scrapeJobDetail, resultsInfo.scrapJobDetail);
  });
});
