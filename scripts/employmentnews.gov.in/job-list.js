"use strict";

// BETA source (see docs/SOURCES.md): the official Employment News journal.
// Generic harvest until someone validates the live markup — contributions
// welcome (see CONTRIBUTING.md).

var harvest = require("../../utils/harvest");

function scrapJobList(html, pageUrl) {
  var links = harvest.harvestLinks(html, pageUrl, {
    minText: 20,
    maxLinks: 150,
  });
  var data = links.map(function (entry) {
    return { postName: entry.title, date: entry.date, link: entry.link };
  });
  return { data: data, next: null };
}

module.exports.jobListUrl = "https://www.employmentnews.gov.in/";
module.exports.scrapJobList = scrapJobList;
module.exports.scrapeJobList = scrapJobList;
