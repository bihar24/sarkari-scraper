"use strict";

// BETA source (see docs/SOURCES.md): exam-hub tables shaped like
// | <Exam> | [Click Here](...previous-year-question-paper...) |
// plus an href-pattern fallback. Validate live before trusting it.

var cheerio = require("cheerio");
var helper = require("../../utils/helper");

function tableItems($, pageUrl) {
  var out = [];
  var seen = {};
  $("table")
    .toArray()
    .forEach(function (table) {
      if (!/previous year question papers/i.test($(table).text() || "")) {
        return;
      }
      $(table)
        .find("tr")
        .toArray()
        .forEach(function (tr) {
          var cells = $(tr).find("th, td").toArray();
          if (cells.length < 2) {
            return;
          }
          var anchor = $(tr).find("a[href]").first();
          if (anchor.length === 0) {
            return;
          }
          var link = helper.formatLink(pageUrl, anchor.attr("href"));
          if (!helper.isHttpUrl(link) || seen[link]) {
            return;
          }
          var exam = helper.formatString($(cells[0]).text());
          if (!exam || /previous year question papers/i.test(exam)) {
            return;
          }
          seen[link] = true;
          out.push({
            exam: exam,
            title: exam + " Previous Year Papers",
            link: link,
          });
        });
    });
  return out;
}

function fallbackItems($, pageUrl) {
  var out = [];
  var seen = {};
  $("a[href]")
    .toArray()
    .forEach(function (anchor) {
      var link = helper.formatLink(pageUrl, $(anchor).attr("href"));
      if (
        !helper.isHttpUrl(link) ||
        link.split("#")[0].split("?")[0] ===
          String(pageUrl).split("#")[0].split("?")[0] ||
        !/previous-year-question-paper/i.test(link) ||
        seen[link]
      ) {
        return;
      }
      seen[link] = true;
      var row = $(anchor).closest("tr");
      var exam = null;
      if (row.length > 0) {
        exam = helper.formatString(row.find("th, td").first().text());
      }
      if (!exam || /click here/i.test(exam)) {
        exam = helper.formatString($(anchor).text());
      }
      if (!exam || /click here/i.test(exam)) {
        exam = "Previous Year Papers";
      }
      out.push({
        exam: exam,
        title: exam + " Previous Year Papers",
        link: link,
      });
    });
  return out;
}

function scrapPaperList(html, pageUrl) {
  var $ = cheerio.load(html);
  var data = tableItems($, pageUrl);
  if (data.length === 0) {
    data = fallbackItems($, pageUrl);
  }
  return { data: data, next: null };
}

module.exports.papersListUrl =
  "https://www.adda247.com/exams/ssc/ssc-previous-year-question-papers/";
module.exports.scrapPaperList = scrapPaperList;
module.exports.scrapePaperList = scrapPaperList;
