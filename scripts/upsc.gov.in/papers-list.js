"use strict";

// BETA source (see docs/SOURCES.md): official UPSC previous-question-papers.
// Strategy: prefer the page's own exam filter (real option values), fall
// back to the exam headings found on the page.

var cheerio = require("cheerio");
var harvest = require("../../utils/harvest");
var helper = require("../../utils/helper");

function filterItems($, pageUrl) {
  var out = [];
  var seen = {};
  $("select").each(function (_i, select) {
    var name = String($(select).attr("name") || $(select).attr("id") || "");
    if (!/exam/i.test(name)) {
      return;
    }
    $(select)
      .find("option")
      .toArray()
      .forEach(function (option) {
        var value = helper.formatString($(option).attr("value"));
        var exam = helper.formatString($(option).text());
        if (!value || !exam || /select|all|choose/i.test(exam)) {
          return;
        }
        var base = String(pageUrl).split("?")[0];
        var link = base + "?field_exam_name_value=" + encodeURIComponent(value);
        if (seen[link]) {
          return;
        }
        seen[link] = true;
        out.push({
          exam: exam,
          title: exam + " — Previous Question Papers",
          link: link,
        });
      });
  });
  return out;
}

function scrapPaperList(html, pageUrl) {
  var $ = cheerio.load(html);
  var data = filterItems($, pageUrl);
  if (data.length === 0) {
    var groups = harvest.harvestPdfGroups(html, pageUrl);
    var seen = {};
    groups.forEach(function (group) {
      if (!group.heading || seen[group.heading]) {
        return;
      }
      seen[group.heading] = true;
      data.push({
        exam: group.heading,
        title: group.heading,
        link: pageUrl,
        pdfCount: group.links.length,
      });
    });
  }
  return { data: data, next: null };
}

module.exports.papersListUrl =
  "https://www.upsc.gov.in/examinations/previous-question-papers";
module.exports.scrapPaperList = scrapPaperList;
module.exports.scrapePaperList = scrapPaperList;
