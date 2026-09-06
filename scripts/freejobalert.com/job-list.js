"use strict";

// BETA source (see docs/SOURCES.md): content-driven extraction of
// /articles/ job links. Validate against the live site before trusting it.

var harvest = require("../../utils/harvest");

function scrapJobList(html, pageUrl) {
  var links = harvest.harvestLinks(html, pageUrl, {
    includePattern: /\/articles\//,
    minText: 15,
    maxLinks: 200,
  });
  var data = links.map(function (entry) {
    return { postName: entry.title, date: entry.date, link: entry.link };
  });
  return { data: data, next: null };
}

module.exports.jobListUrl =
  "https://www.freejobalert.com/latest-notifications/";
module.exports.scrapJobList = scrapJobList;
module.exports.scrapeJobList = scrapJobList;
