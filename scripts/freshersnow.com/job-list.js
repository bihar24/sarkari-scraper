"use strict";

var cheerio = require("cheerio");
var helper = require("../../utils/helper");

function headerIndex($, row) {
  var cells = $(row).find("th, td").toArray();
  var map = {};
  cells.forEach(function (cell, i) {
    var text = helper.formatString($(cell).text());
    if (!text) return;
    if (/company|organisation|organization|recruiter/i.test(text))
      map.company = i;
    if (/post\s*name|post\s*name\(s\)|position|vacancy name/i.test(text))
      map.postName = i;
    if (/education|qualification|eligibility/i.test(text)) map.education = i;
    if (/total\s*posts|total\s*vacanc|posts|vacancies/i.test(text))
      map.totalPosts = i;
    if (/location/i.test(text)) map.location = i;
    if (/last\s*date|deadline/i.test(text)) map.lastDate = i;
    if (/apply\s*online|apply|link/i.test(text)) map.apply = i;
    if (/notification|latest\s*notification/i.test(text)) map.notification = i;
  });
  return map;
}

function cellText($, cells, i) {
  return helper.formatString($(cells[i]).text());
}

function parseTable($, table, pageUrl) {
  var out = [];
  var seen = {};
  var rows = $(table).find("tr").toArray();
  var header = rows.find(function (row) {
    return $(row).find("th").length > 0;
  });
  var map = header ? headerIndex($, header) : {};
  rows.forEach(function (row) {
    var cells = $(row).find("td").toArray();
    if (cells.length < 6) return;
    var company = header
      ? cellText($, cells, map.company !== undefined ? map.company : 0)
      : cellText($, cells, 0);
    var postName = header
      ? cellText($, cells, map.postName !== undefined ? map.postName : 1)
      : cellText($, cells, 1);
    var education = header
      ? cellText($, cells, map.education !== undefined ? map.education : 2)
      : cellText($, cells, 2);
    var totalPosts = header
      ? cellText($, cells, map.totalPosts !== undefined ? map.totalPosts : 3)
      : cellText($, cells, 3);
    var location = header
      ? cellText($, cells, map.location !== undefined ? map.location : 4)
      : cellText($, cells, 4);
    var lastDate = header
      ? cellText($, cells, map.lastDate !== undefined ? map.lastDate : 5)
      : cellText($, cells, 5);

    var anchors = $(row).find("a[href]").toArray();
    var anchor = anchors.find(function (a) {
      var text = helper.formatString($(a).text());
      return /apply|click here|notification/i.test(text || "");
    });
    if (!anchor) anchor = anchors[0];
    var link = helper.formatLink(pageUrl, $(anchor).attr("href"));
    if (!link || !helper.isHttpUrl(link)) return;
    if (seen[link]) return;
    seen[link] = true;
    if (!company && !postName) return;
    out.push({
      company: company,
      postName: postName,
      education: education,
      totalPosts: totalPosts,
      location: location,
      lastDate: lastDate,
      link: link,
    });
  });
  return out;
}

function scrapJobList(html, pageUrl) {
  var $ = cheerio.load(html);

  var data = [];
  var next = null;

  var legacy = $("#example > tbody > tr").toArray();
  legacy.forEach(function (row) {
    var link = helper.formatLink(
      pageUrl,
      $(row).find("td:nth-child(7) a").attr("href")
    );
    if (!link || !helper.isHttpUrl(link)) return;
    data.push({
      company: helper.formatString($(row).find("td:nth-child(1)").text()),
      postName: helper.formatString($(row).find("td:nth-child(2)").text()),
      education: helper.formatString($(row).find("td:nth-child(3)").text()),
      totalPosts: helper.formatString($(row).find("td:nth-child(4)").text()),
      location: helper.formatString($(row).find("td:nth-child(5)").text()),
      lastDate: helper.formatString($(row).find("td:nth-child(6)").text()),
      link: link,
    });
  });

  if (data.length === 0) {
    var candidates = [];
    $("table").each(function (_i, table) {
      var text = $(table).text();
      if (
        /government\s+jobs|last\s+date|apply\s+online|post\s+name/i.test(text)
      ) {
        candidates.push(table);
      }
    });
    candidates.forEach(function (table) {
      if (/header|nav|sidebar|footer/i.test($(table).attr("class") || ""))
        return;
      data = data.concat(parseTable($, table, pageUrl));
    });
  }

  return { data: data, next: next };
}

module.exports.jobListUrl = "https://www.freshersnow.com/government-jobs-india";
module.exports.scrapJobList = scrapJobList;
// Correctly-spelled alias; the old name stays for backwards compatibility.
module.exports.scrapeJobList = scrapJobList;
