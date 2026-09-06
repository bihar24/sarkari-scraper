"use strict";

var cheerio = require("cheerio");
var helper = require("../../utils/helper");

function scrapJobList(html, pageUrl) {
  var $ = cheerio.load(html);

  var data = [];
  var next = null;

  var date = null;

  var arr1 = $("#headbox-1").children().toArray();
  var i;
  var j;
  for (i = 0; i < arr1.length; i++) {
    if ($(arr1[i]).attr("id") === "postname") {
      var chunks = $(arr1[i])
        .text()
        .split(/Latest Jobs on/);
      date = helper.formatString(chunks.length > 1 ? chunks[1] : null);
    }
    var arr2 = $(arr1[i]).find("li").toArray();
    for (j = 0; j < arr2.length; j++) {
      var anchor = $(arr2[j]).find("[href]:not([href=''])").first();
      data.push({
        postName: helper.formatString(anchor.text()),
        date: date,
        link: helper.formatLink(pageUrl, anchor.attr("href")),
      });
    }
  }

  return { data: data, next: next };
}

module.exports.jobListUrl = "https://sarkariresults.info/page/latestjobs.php";
module.exports.scrapJobList = scrapJobList;
// Correctly-spelled alias; the old name stays for backwards compatibility.
module.exports.scrapeJobList = scrapJobList;
