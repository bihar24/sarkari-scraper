"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");

var fjaList = require("../scripts/freejobalert.com/job-list");
var fjaDetail = require("../scripts/freejobalert.com/job-detail");
var enList = require("../scripts/employmentnews.gov.in/job-list");
var enDetail = require("../scripts/employmentnews.gov.in/job-detail");
var rrList = require("../scripts/rojgarresult.com/job-list");
var rrDetail = require("../scripts/rojgarresult.com/job-detail");

describe("freejobalert.com (beta)", function () {
  it("lists /articles/ links with dates, skips noise", function () {
    var html =
      "<main><ul>" +
      '<li><a href="/articles/bank-clerk-recruitment-2026-999">Bank 2000 Clerk Recruitment Online Form 2026</a> 01-09-2026</li>' +
      '<li><a href="/articles/railway-group-d-2026-1000">Railway Group D 5000 Posts Notification 2026</a></li>' +
      '</ul><footer><a href="/privacy-policy-page">Privacy policy page here</a></footer></main>';
    var out = fjaList.scrapJobList(
      html,
      "https://www.freejobalert.com/latest-notifications/"
    );
    assert.equal(out.data.length, 2);
    assert.equal(
      out.data[0].postName,
      "Bank 2000 Clerk Recruitment Online Form 2026"
    );
    assert.equal(
      out.data[0].link,
      "https://www.freejobalert.com/articles/bank-clerk-recruitment-2026-999"
    );
    assert.equal(out.data[0].date, "01-09-2026");
    assert.equal(out.next, null);
  });

  it("reads article sections", function () {
    var html =
      "<article><h1>Bank Clerk Recruitment 2026</h1>" +
      "<h2>Vacancy Details</h2><ul><li>Clerk: 2000 posts</li></ul>" +
      '<h2>Important Links</h2><p><a href="/apply-here">Apply Online Here</a></p></article>';
    var data = fjaDetail.scrapJobDetail(
      html,
      "https://www.freejobalert.com/articles/x"
    );
    assert.equal(data[1].key, "Title");
    assert.equal(data[1].value, "Bank Clerk Recruitment 2026");
    assert.equal(data[3].type, "Link");
    assert.equal(
      data[3].value[0].link,
      "https://www.freejobalert.com/apply-here"
    );
  });
});

describe("employmentnews.gov.in (beta)", function () {
  it("harvests long content links", function () {
    var html =
      '<div><a href="/issue/vol-l-no-22">Employment News Weekly Issue Vol L Number 22 PDF</a>' +
      '<a href="/">Home</a></div>';
    var out = enList.scrapJobList(html, "https://www.employmentnews.gov.in/");
    assert.equal(out.data.length, 1);
    assert.equal(
      out.data[0].postName,
      "Employment News Weekly Issue Vol L Number 22 PDF"
    );
  });

  it("reads a journal article page", function () {
    var html =
      "<main><h1>Weekly Issue Highlights</h1><h2>Top Vacancies</h2>" +
      "<ul><li>UPSC announces new examination calendar dates</li></ul></main>";
    var data = enDetail.scrapJobDetail(
      html,
      "https://www.employmentnews.gov.in/x"
    );
    assert.equal(data[1].value, "Weekly Issue Highlights");
    assert.equal(data[2].type, "List");
  });
});

describe("rojgarresult.com (beta)", function () {
  it("harvests long content links", function () {
    var html =
      '<div class="entry-content">' +
      '<a href="/up-police-result-2026">UP Police Constable Final Result Declared 2026</a>' +
      '<a href="/contact">Contact</a></div>';
    var out = rrList.scrapJobList(html, "https://rojgarresult.com/");
    assert.equal(out.data.length, 1);
    assert.equal(
      out.data[0].link,
      "https://rojgarresult.com/up-police-result-2026"
    );
  });

  it("reads a result article page", function () {
    var html =
      '<div class="entry-content"><h1>UP Police Result 2026</h1>' +
      "<h2>Result Details</h2><p>Candidates can check their results using roll number now.</p></div>";
    var data = rrDetail.scrapJobDetail(html, "https://rojgarresult.com/x");
    assert.equal(data[1].value, "UP Police Result 2026");
    assert.equal(data[2].type, "Paragraph");
  });
});
