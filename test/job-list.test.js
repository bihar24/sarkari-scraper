"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");

var sarkariresult = require("../scripts/sarkariresult.com/job-list");
var sarkariexam = require("../scripts/sarkariexam.com/job-list");
var resultsInfo = require("../scripts/sarkariresults.info/job-list");
var freshersnow = require("../scripts/freshersnow.com/job-list");

describe("sarkariresult.com job-list", function () {
  var html =
    '<div id="post">' +
    '<ul><a href="/skip"></a><a href="/job/1">Post One</a> Last Date : 01-Jan-2020</ul>' +
    '<ul><div>note</div><span>x</span><a href="/job/2">Post Two</a></ul>' +
    "</div>";

  it("extracts posts and resolves relative links", function () {
    var result = sarkariresult.scrapJobList(
      html,
      "https://www.sarkariresult.com/latestjob.php"
    );
    assert.equal(result.data.length, 2);
    assert.equal(result.data[0].postName, "Post One");
    assert.equal(result.data[0].lastDate, "01-Jan-2020");
    assert.equal(result.data[0].link, "https://www.sarkariresult.com/job/1");
    // Second <ul>: anchor is not :nth-child(2), fallback still finds it.
    assert.equal(result.data[1].postName, "Post Two");
    assert.equal(result.data[1].link, "https://www.sarkariresult.com/job/2");
    assert.equal(result.data[1].lastDate, null);
    assert.equal(result.next, null);
  });

  it("exposes the correctly-spelled alias", function () {
    assert.equal(sarkariresult.scrapeJobList, sarkariresult.scrapJobList);
  });

  it("extracts the current content-list structure without nav links", function () {
    var html =
      '<main class="entry-content"><h1>All Latest Jobs</h1><ul>' +
      '<li><a href="/2026/uiic-ao-sep26/">UIIC AO Online Form 2026 | Last Date : 28/09/2026</a></li>' +
      '<li><a href="/2026/rcfl-apprentice-sep26/">RCFL Apprentice 2026 | Last Date : 20/09/2026</a></li>' +
      '<li><a href="/about-us/">About Us</a></li>' +
      "</ul></main>";
    var result = sarkariresult.scrapJobList(
      html,
      "https://www.sarkariresult.com/latestjob/"
    );
    assert.equal(result.data.length, 2);
    assert.match(result.data[0].postName, /UIIC AO/);
    assert.equal(
      result.data[0].link,
      "https://www.sarkariresult.com/2026/uiic-ao-sep26/"
    );
    assert.equal(result.data[0].lastDate, "28/09/2026");
  });
});

describe("sarkariexam.com job-list", function () {
  var html =
    '<div class="category-typepost"><div><ul>' +
    "<h3>Latest Form Issued on 12-Feb-2020</h3>" +
    '<li><a href="/post/1">Job A</a></li>' +
    '<li><a href="https://www.sarkariexam.com/post/2">Job B</a></li>' +
    "</ul></div></div>" +
    '<a class="nextpostslink" href="/category/hot-job/page/2">Next</a>';

  it("extracts the current Hot Job archive and excludes category/author links", function () {
    var html =
      "<main><h1>Hot Job</h1><div>" +
      '<p><a href="/rrb-railway-group-d-2026/">Railway RRB Group D Answer Key 2026</a></p>' +
      '<p><a href="/bpsc-school-teacher-tre-4-0-2026/">BPSC School Teacher TRE 4.0</a></p>' +
      '<p><a href="/category/hot-job/page/2/">2</a></p>' +
      '<p><a href="/author/vishal/">Author</a></p>' +
      "</div>" +
      '<a class="page-numbers next" href="/category/hot-job/page/2/">Next</a></main>';
    var result = sarkariexam.scrapJobList(
      html,
      "https://www.sarkariexam.com/category/hot-job/"
    );
    assert.equal(result.data.length, 2);
    assert.equal(
      result.data[0].link,
      "https://www.sarkariexam.com/rrb-railway-group-d-2026/"
    );
    assert.equal(
      result.next,
      "https://www.sarkariexam.com/category/hot-job/page/2/"
    );
  });

  it("carries the date header and resolves links incl. pagination", function () {
    var result = sarkariexam.scrapJobList(
      html,
      "https://www.sarkariexam.com/category/hot-job"
    );
    assert.equal(result.data.length, 2);
    assert.equal(result.data[0].date, "12-Feb-2020");
    assert.equal(result.data[1].date, "12-Feb-2020");
    assert.equal(result.data[0].link, "https://www.sarkariexam.com/post/1");
    assert.equal(result.data[1].link, "https://www.sarkariexam.com/post/2");
    assert.equal(
      result.next,
      "https://www.sarkariexam.com/category/hot-job/page/2"
    );
  });
});

describe("sarkariresults.info job-list", function () {
  var html =
    '<div id="headbox-1">' +
    '<div id="postname">Latest Jobs on 03-Mar-2020</div>' +
    "<div><ul>" +
    '<li><a href="/jobs/1">Clerk</a></li>' +
    '<li><a href="">empty</a><a href="/jobs/2">Peon</a></li>' +
    "</ul></div>" +
    "</div>";

  it("extracts posts with dates and absolute links", function () {
    var result = resultsInfo.scrapJobList(
      html,
      "https://sarkariresults.info/page/latestjobs.php"
    );
    assert.equal(result.data.length, 2);
    assert.equal(result.data[0].postName, "Clerk");
    assert.equal(result.data[0].date, "03-Mar-2020");
    assert.equal(result.data[0].link, "https://sarkariresults.info/jobs/1");
    assert.equal(result.data[1].postName, "Peon");
    assert.equal(result.data[1].link, "https://sarkariresults.info/jobs/2");
  });
});

describe("freshersnow.com job-list", function () {
  var html =
    '<table id="example"><tbody>' +
    "<tr><td>UPSC</td><td>Clerk</td><td>Graduate</td><td>100</td>" +
    "<td>Delhi</td><td>01-01-2021</td>" +
    '<td><a href="/govt/upsc-clerk">View</a></td></tr>' +
    "</tbody></table>";

  it("extracts the current header-driven government jobs table without fixed IDs", function () {
    var html =
      "<main><table><thead><tr><th>Company</th><th>Post Name(s)</th>" +
      "<th>Education</th><th>Total Posts</th><th>Location</th><th>Last Date</th>" +
      "<th>Apply Online</th><th>Latest Notifications</th></tr></thead><tbody>" +
      "<tr><td>IOCL</td><td>Apprentices</td><td>ITI, Diploma</td><td>501</td>" +
      "<td>Across India</td><td>12th January 2026</td>" +
      '<td><a href="/iocl-apprentice-jobs">Apply</a></td><td>IOCL notification</td></tr>' +
      "</tbody></table></main>";
    var result = freshersnow.scrapJobList(
      html,
      "https://www.freshersnow.com/government-jobs-india/"
    );
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].company, "IOCL");
    assert.equal(result.data[0].postName, "Apprentices");
    assert.equal(result.data[0].lastDate, "12th January 2026");
    assert.equal(
      result.data[0].link,
      "https://www.freshersnow.com/iocl-apprentice-jobs"
    );
  });

  it("extracts table rows with absolute links", function () {
    var result = freshersnow.scrapJobList(
      html,
      "https://www.freshersnow.com/government-jobs-india"
    );
    assert.equal(result.data.length, 1);
    assert.deepEqual(result.data[0], {
      company: "UPSC",
      postName: "Clerk",
      education: "Graduate",
      totalPosts: "100",
      location: "Delhi",
      lastDate: "01-01-2021",
      link: "https://www.freshersnow.com/govt/upsc-clerk",
    });
  });
});
