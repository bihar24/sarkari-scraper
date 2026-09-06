"use strict";

var cheerio = require("cheerio");
var helper = require("../../utils/helper");

function scrapJobList(html, pageUrl) {
  var $ = cheerio.load(html);

  var data = [];
  var next = null;

  var arr = $("#example > tbody > tr").toArray();
  var i;
  for (i = 0; i < arr.length; i++) {
    data.push({
      company: helper.formatString($(arr[i]).find("td:nth-child(1)").text()),
      postName: helper.formatString($(arr[i]).find("td:nth-child(2)").text()),
      education: helper.formatString($(arr[i]).find("td:nth-child(3)").text()),
      totalPosts: helper.formatString($(arr[i]).find("td:nth-child(4)").text()),
      location: helper.formatString($(arr[i]).find("td:nth-child(5)").text()),
      lastDate: helper.formatString($(arr[i]).find("td:nth-child(6)").text()),
      link: helper.formatLink(
        pageUrl,
        $(arr[i]).find("td:nth-child(7) a").attr("href")
      ),
    });
  }

  return { data: data, next: next };
}

module.exports.jobListUrl = "https://www.freshersnow.com/government-jobs-india";
module.exports.scrapJobList = scrapJobList;
// Correctly-spelled alias; the old name stays for backwards compatibility.
module.exports.scrapeJobList = scrapJobList;
