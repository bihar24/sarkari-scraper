"use strict";

var cheerio = require("cheerio");
var helper = require("../../utils/helper");
var block = require("../../utils/block");

function looksLikeContent(anchor, pageUrl, text) {
  var href = helper.formatLink(pageUrl, anchor.attribs && anchor.attribs.href);
  if (!href || !helper.isHttpUrl(href)) return false;
  if (block.looksLikeNavigation(anchor, text, href)) return false;
  if (!helper.isSameSite(href, "sarkariresult.com")) return false;
  href = href.toLowerCase();
  try {
    var pathname = new URL(href).pathname.toLowerCase();
    // Current story slugs carry the year (e.g. /2026/uiic-ao-sep26/) or the
    // Bihar section (/bihar/...). A link without a meaningful slug is usually
    // site navigation.
    if (/\/(?:19|20)\d{2}\//.test(pathname)) return true;
    if (/^\/bihar\//.test(pathname)) return true;
    return pathname.split("/").filter(Boolean).length >= 1;
  } catch (err) {
    return false;
  }
}

function collectFromList($, root) {
  var out = [];
  var seen = {};
  var lists = $(root).find("ul, ol").toArray();
  var i, j;
  for (i = 0; i < lists.length; i++) {
    var anchors = $(lists[i])
      .find("a[href][href!='']")
      .get()
      .filter(function (anchor) {
        var text = helper.formatString($(anchor).text());
        return (
          text &&
          looksLikeContent(
            anchor,
            "https://www.sarkariresult.com/latestjob/",
            text
          )
        );
      });
    for (j = 0; j < anchors.length; j++) {
      var anchor = anchors[j];
      var link = helper.formatLink(
        "https://www.sarkariresult.com/latestjob/",
        $(anchor).attr("href")
      );
      if (seen[link]) continue;
      seen[link] = true;
      var containerText = $(anchor).closest("li, div, p").eq(0).text();
      var chunks = helper.formatString(containerText).split(/Last Date\s*:/i);
      out.push({
        postName: helper.formatString($(anchor).text()),
        lastDate: helper.formatString(chunks.length > 1 ? chunks[1] : null),
        link: link,
      });
    }
  }
  return out;
}

function scrapJobList(html, pageUrl) {
  var $ = cheerio.load(html);

  var data = [];
  var next = null;

  // Backward-compatible primary path.
  var arr = $("#post ul").toArray();
  var i;
  for (i = 0; i < arr.length; i++) {
    var anchors = $(arr[i]).find("a:nth-child(2)");
    if (anchors.length === 0) anchors = $(arr[i]).find("a[href]");
    var anchor = anchors.first();
    var chunks = $(arr[i])
      .text()
      .split(/Last Date\s*:/i);
    data.push({
      postName: helper.formatString(anchor.text()),
      lastDate: helper.formatString(chunks.length > 1 ? chunks[1] : null),
      link: helper.formatString(anchor.attr("href"))
        ? helper.formatLink(pageUrl, anchor.attr("href"))
        : null,
    });
  }
  data = data.filter(function (item) {
    return (
      item.link &&
      helper.isHttpUrl(item.link) &&
      (item.postName || item.company)
    );
  });

  // Current-page fallback: scoped content lists only.
  if (data.length === 0) {
    var roots = [
      ".entry-content",
      ".post-content",
      "main",
      "#content",
      "article",
    ]
      .map(function (selector) {
        return $(selector).toArray();
      })
      .reduce(function (all, nextRoots) {
        return all.concat(nextRoots);
      }, []);
    if (roots.length === 0) roots = [$("body").get(0)];
    var fallback = [];
    roots.forEach(function (root) {
      fallback = fallback.concat(collectFromList($, root));
    });
    var seen = {};
    fallback.forEach(function (item) {
      if (!seen[item.link]) {
        seen[item.link] = true;
        data.push(item);
      }
    });
    data = data.filter(function (item) {
      return item.link && helper.isHttpUrl(item.link);
    });
  }

  return { data: data, next: next };
}

module.exports.jobListUrl = "https://www.sarkariresult.com/latestjob.php";
module.exports.scrapJobList = scrapJobList;
// Correctly-spelled alias; the old name stays for backwards compatibility.
module.exports.scrapeJobList = scrapJobList;
