"use strict";

var cheerio = require("cheerio");
var helper = require("../../utils/helper");

function scrapJobList(html, pageUrl) {
  var $ = cheerio.load(html);

  var data = [];
  var next = null;

  var date = null;

  var arr = $(".category-typepost > div > ul").children().toArray();
  var i;
  for (i = 0; i < arr.length; i++) {
    if (helper.tagName($, arr[i]) === "H3") {
      var chunks = $(arr[i])
        .text()
        .split(/Latest Form Issued on/);
      date = helper.formatString(chunks.length > 1 ? chunks[1] : null);
    }
    if (helper.tagName($, arr[i]) === "LI") {
      var anchor = $(arr[i]).find("a").first();
      data.push({
        postName: helper.formatString(anchor.text()),
        date: date,
        link: helper.formatLink(pageUrl, anchor.attr("href")),
      });
    }
  }

  if ($(".nextpostslink").length > 0) {
    next = helper.formatLink(
      pageUrl,
      helper.formatString($(".nextpostslink").first().attr("href"))
    );
  }

  return { data: data, next: next };
}

module.exports.jobListUrl = "https://www.sarkariexam.com/category/hot-job";
module.exports.scrapJobList = scrapJobList;
// Correctly-spelled alias; the old name stays for backwards compatibility.
module.exports.scrapeJobList = scrapJobList;
