"use strict";

var cheerio = require("cheerio");
var helper = require("../../utils/helper");

function scrapJobList(html, pageUrl) {
  var $ = cheerio.load(html);

  var data = [];
  var next = null;

  var arr = $("#post ul").toArray();
  var i;
  for (i = 0; i < arr.length; i++) {
    // Primary selector kept for backwards compatibility; fall back to the
    // first link with an href when the site markup drifts.
    var anchors = $(arr[i]).find("a:nth-child(2)");
    if (anchors.length === 0) {
      anchors = $(arr[i]).find("a[href]");
    }
    var anchor = anchors.first();
    var chunks = $(arr[i])
      .text()
      .split(/Last Date\s?:/);
    data.push({
      postName: helper.formatString(anchor.text()),
      lastDate: helper.formatString(chunks.length > 1 ? chunks[1] : null),
      link: helper.formatLink(pageUrl, anchor.attr("href")),
    });
  }

  return { data: data, next: next };
}

module.exports.jobListUrl = "https://www.sarkariresult.com/latestjob.php";
module.exports.scrapJobList = scrapJobList;
// Correctly-spelled alias; the old name stays for backwards compatibility.
module.exports.scrapeJobList = scrapJobList;
