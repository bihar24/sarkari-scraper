"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");

var list = require("../scripts/adda247.com/papers-list");
var detail = require("../scripts/adda247.com/papers-detail");

var HUB =
  "https://www.adda247.com/exams/ssc/ssc-previous-year-question-papers/";

describe("adda247.com papers-list (beta)", function () {
  it("reads the exam hub table", function () {
    var html =
      "<table><tr><th>SSC Exam</th><th>Previous Year Question Papers</th></tr>" +
      '<tr><td>SSC CGL</td><td><a href="https://www.adda247.com/jobs/ssc-cgl-previous-year-question-paper/">Click Here</a></td></tr>' +
      '<tr><td>SSC CHSL</td><td><a href="https://www.adda247.com/jobs/ssc-chsl-previous-year-question-paper/">Click Here</a></td></tr>' +
      "</table>";
    var out = list.scrapPaperList(html, HUB);
    assert.equal(out.data.length, 2);
    assert.equal(out.data[0].exam, "SSC CGL");
    assert.equal(out.data[0].title, "SSC CGL Previous Year Papers");
    assert.equal(
      out.data[0].link,
      "https://www.adda247.com/jobs/ssc-cgl-previous-year-question-paper/"
    );
  });

  it("falls back to href-pattern matching", function () {
    var html =
      "<table><tr><td>SSC MTS</td>" +
      '<td><a href="https://www.adda247.com/jobs/ssc-mts-previous-year-question-paper/">Click Here</a></td></tr></table>';
    var out = list.scrapPaperList(html, HUB);
    assert.equal(out.data.length, 1);
    assert.equal(out.data[0].exam, "SSC MTS");
  });

  it("ignores self links", function () {
    var out = list.scrapPaperList(
      '<a href="' + HUB + '">This hub page</a>',
      HUB
    );
    assert.deepEqual(out.data, []);
  });
});

describe("adda247.com papers-detail (beta)", function () {
  var html =
    "<h1>SSC CPO Previous Year Question Paper</h1>" +
    "<h2>SSC CPO 2024 Papers</h2>" +
    "<table><thead><tr><th>Exam Date</th><th>Shift</th><th>English</th><th>Hindi</th></tr></thead>" +
    "<tr><td>27 June 2024</td><td>1</td>" +
    '<td><a href="/wp-content/uploads/cpo-s1.pdf">Download PDF</a></td>' +
    '<td><a href="/wp-content/uploads/cpo-s1-Hindi.pdf">Download PDF</a></td></tr>' +
    "<tr><td></td><td>2</td>" +
    '<td><a href="/wp-content/uploads/cpo-s2.pdf">Download PDF</a></td>' +
    "<td></td></tr></table>" +
    "<h2>SSC CPO 2023 Papers</h2>" +
    "<table><tr><th>Date</th><th>Download</th></tr>" +
    '<tr><td>3 October 2023</td><td><a href="/wp-content/uploads/cpo23.pdf">PDF File Download</a></td></tr></table>';

  it("builds shift/language-labelled PDF links per section", function () {
    var data = detail.scrapPaperDetail(html, HUB + "ssc-cpo/");
    assert.equal(data[0].key, "Post Link");
    assert.equal(data[1].key, "Exam");
    assert.equal(data[1].value, "SSC CPO Previous Year Question Paper");
    assert.equal(data[2].key, "SSC CPO 2024 Papers");
    assert.equal(data[2].type, "Link");
    assert.equal(data[2].value.length, 3);
    assert.equal(data[2].value[0].text, "27 June 2024 · Shift 1 · (English)");
    assert.equal(data[2].value[1].text, "27 June 2024 · Shift 1 · (Hindi)");
    assert.equal(data[2].value[2].text, "27 June 2024 · Shift 2 · (English)");
    assert.equal(data[3].key, "SSC CPO 2023 Papers");
    assert.equal(data[3].value[0].text, "3 October 2023");
  });
});
