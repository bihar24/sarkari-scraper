"use strict";

var helper = require("./helper");
var http = require("./http");

// Walk a paginated job list. Guards against pagination cycles (visited set),
// runaway crawls (maxPages) and off-site pagination traps
// (sameSiteDomain). `scrapFn` is a job-list parser with the signature
// (html, pageUrl) -> { data, next }.
async function crawlJobList(options) {
  var scrapFn = options.scrapFn;
  var pageUrl = options.startUrl;
  var client = options.client;
  var maxPages = options.maxPages;
  var delayMs = options.delayMs || 0;
  var sameSiteDomain = options.sameSiteDomain || null;
  var log =
    options.log ||
    function () {
      // no-op when the caller does not care about progress
    };

  var items = [];
  var visited = new Set();
  var pages = 0;

  while (pageUrl && pages < maxPages) {
    if (visited.has(pageUrl)) {
      log("Pagination loop detected at " + pageUrl + "; stopping.");
      break;
    }
    visited.add(pageUrl);

    var response = await client.get(pageUrl);
    var finalPageUrl = http.finalUrl(response) || pageUrl;
    var result = scrapFn(response.data, finalPageUrl) || {};
    var data = Array.isArray(result.data) ? result.data : [];
    items.push.apply(items, data);
    pages += 1;
    log(finalPageUrl + " parsed (" + data.length + " items).");

    var next = helper.formatString(result.next);
    if (!next) {
      break;
    }
    var resolved = helper.formatLink(finalPageUrl, next);
    if (!resolved || !helper.isHttpUrl(resolved)) {
      log('Ignoring non-HTTP "next page" link: ' + next);
      break;
    }
    if (sameSiteDomain && !helper.isSameSite(resolved, sameSiteDomain)) {
      log('Ignoring off-site "next page" link: ' + resolved);
      break;
    }
    if (visited.has(resolved)) {
      log("Pagination loop detected at " + resolved + "; stopping.");
      break;
    }
    pageUrl = resolved;
    if (delayMs > 0) {
      await helper.sleep(delayMs);
    }
  }

  if (pageUrl && pages >= maxPages) {
    log("Reached max-pages limit (" + maxPages + "); stopping.");
  }

  return { items: items, pages: pages };
}

module.exports.crawlJobList = crawlJobList;
