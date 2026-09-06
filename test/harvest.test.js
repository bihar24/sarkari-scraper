"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var harvest = require("../utils/harvest");

describe("harvest.harvestLinks", function () {
  var html =
    "<main>" +
    '<ul><li><a href="/articles/upsc-clerk-2026-123">UPSC 500 Clerk Online Form 2026</a> 15-08-2026</li>' +
    '<li><a href="/articles/ssc-gd-2026-124">SSC GD Constable Recruitment 2026</a></li>' +
    '<li><a href="/articles/upsc-clerk-2026-123">UPSC 500 Clerk Online Form 2026</a></li></ul>' +
    '<nav><a href="/login">Login</a><a href="/contact">Contact us page here</a></nav>' +
    '<a href="#top">Back to top of the page</a>' +
    '<a href="javascript:void(0)">Do nothing link here</a>' +
    "</main>";

  it("keeps content links, drops nav/anchors/duplicates, finds dates", function () {
    var links = harvest.harvestLinks(html, "https://site.test/", {
      includePattern: /\/articles\//,
    });
    assert.equal(links.length, 2);
    assert.equal(links[0].title, "UPSC 500 Clerk Online Form 2026");
    assert.equal(
      links[0].link,
      "https://site.test/articles/upsc-clerk-2026-123"
    );
    assert.equal(links[0].date, "15-08-2026");
    assert.equal(links[1].date, null);
  });

  it("works without an include pattern but skips short text", function () {
    var links = harvest.harvestLinks(
      '<div><a href="/a-very-long-link-url">Hi</a></div>',
      "https://x.test/"
    );
    assert.deepEqual(links, []);
  });
});

describe("harvest.harvestPdfLinks", function () {
  it("finds PDF anchors by href or download wording", function () {
    var html =
      "<div>" +
      '<a href="/files/paper-s1.pdf">SSC CGL 2024 Shift 1</a>' +
      '<a href="/go/123">Download PDF</a>' +
      '<a href="/about">About us</a>' +
      "</div>";
    var links = harvest.harvestPdfLinks(html, "https://x.test/");
    assert.equal(links.length, 2);
    assert.equal(links[0].pdfUrl, "https://x.test/files/paper-s1.pdf");
    assert.equal(links[1].title, "Download PDF");
  });
});

describe("harvest.harvestPdfGroups", function () {
  it("groups PDFs under preceding headings", function () {
    var html =
      "<div>" +
      "<h2>Civil Services (Preliminary) 2024</h2>" +
      '<a href="/a.pdf">General Studies (15 MB)</a>' +
      '<a href="/b.pdf">CSAT (3 MB)</a>' +
      "<h2>NDA Examination 2024</h2>" +
      '<a href="/c.pdf">Mathematics</a>' +
      '<a href="/about">About</a>' +
      "</div>";
    var groups = harvest.harvestPdfGroups(html, "https://x.test/");
    assert.equal(groups.length, 2);
    assert.equal(groups[0].heading, "Civil Services (Preliminary) 2024");
    assert.equal(groups[0].links.length, 2);
    assert.equal(groups[1].links[0].pdfUrl, "https://x.test/c.pdf");
  });

  it("ignores non-PDF content and empty groups", function () {
    var groups = harvest.harvestPdfGroups(
      "<div><h2>Nope</h2><p>text</p></div>",
      "https://x.test/"
    );
    assert.deepEqual(groups, []);
  });
});
