"use strict";

// BETA source (see docs/SOURCES.md): generic article reader.
// Validate against the live site before trusting it.

var article = require("../../utils/article");

function scrapJobDetail(html, url) {
  return article.extractArticle(html, url);
}

module.exports.scrapJobDetail = scrapJobDetail;
module.exports.scrapeJobDetail = scrapJobDetail;
