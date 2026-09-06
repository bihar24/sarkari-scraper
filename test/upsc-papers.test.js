"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");

var list = require("../scripts/upsc.gov.in/papers-list");
var detail = require("../scripts/upsc.gov.in/papers-detail");

var BASE = "https://www.upsc.gov.in/examinations/previous-question-papers";

describe("upsc.gov.in papers-list (beta)", function () {
  it("builds exam links from the page filter", function () {
    var html =
      '<form><select name="field_exam_name_value">' +
      '<option value="">- Any -</option>' +
      '<option value="civil services">Civil Services (P) Examination</option>' +
      '<option value="nda">N.D.A. Examination</option>' +
      "</select></form>";
    var out = list.scrapPaperList(html, BASE);
    assert.equal(out.data.length, 2);
    assert.equal(out.data[0].exam, "Civil Services (P) Examination");
    assert.equal(
      out.data[0].link,
      BASE + "?field_exam_name_value=civil%20services"
    );
    assert.equal(out.data[1].link, BASE + "?field_exam_name_value=nda");
  });

  it("falls back to exam headings on the page", function () {
    var html =
      "<div><h2>Civil Services (Preliminary) 2024</h2>" +
      '<a href="/sites/default/files/gs.pdf">General Studies</a>' +
      '<a href="/sites/default/files/csat.pdf">CSAT Paper</a></div>';
    var out = list.scrapPaperList(html, BASE);
    assert.equal(out.data.length, 1);
    assert.equal(out.data[0].exam, "Civil Services (Preliminary) 2024");
    assert.equal(out.data[0].link, BASE);
    assert.equal(out.data[0].pdfCount, 2);
  });
});

describe("upsc.gov.in papers-detail (beta)", function () {
  it("groups PDFs under exam headings", function () {
    var html =
      "<div><h2>Civil Services (Preliminary) 2024</h2>" +
      '<a href="/sites/default/files/gs.pdf">General Studies (15 MB)</a>' +
      '<a href="/sites/default/files/csat.pdf">CSAT (3 MB)</a>' +
      "<h2>NDA Examination 2024</h2>" +
      '<a href="/sites/default/files/maths.pdf">Mathematics</a></div>';
    var data = detail.scrapPaperDetail(html, BASE + "?field_exam_name_value=x");
    assert.equal(data.length, 3);
    assert.equal(data[0].key, "Post Link");
    assert.equal(data[1].key, "Civil Services (Preliminary) 2024");
    assert.equal(data[1].type, "Link");
    assert.equal(data[1].value.length, 2);
    assert.equal(
      data[1].value[0].link,
      "https://www.upsc.gov.in/sites/default/files/gs.pdf"
    );
    assert.equal(data[2].key, "NDA Examination 2024");
  });
});
