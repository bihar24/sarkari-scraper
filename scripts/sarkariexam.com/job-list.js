"use strict";

var cheerio = require("cheerio");
var helper = require("../../utils/helper");
var block = require("../../utils/block");

function isPostLink(anchor, pageUrl, text) {
  var href = helper.formatLink(pageUrl, anchor.attribs && anchor.attribs.href);
  if (!href || !helper.isHttpUrl(href)) return false;
  if (block.looksLikeNavigation(anchor, text, href)) return false;
  if (!helper.isSameSite(href, "sarkariexam.com")) return false;
  try {
    var pathname = new URL(href).pathname.toLowerCase();
    if (/^\/?category\//.test(pathname)) return false;
    if (/^\/?author\//.test(pathname)) return false;
    if (/^\/?tag\//.test(pathname)) return false;
    return pathname.split("/").filter(Boolean).length >= 1;
  } catch (err) {
    return false;
  }
}

function collectLinks($, pageUrl) {
  var seen = {};
  var roots = [
    "main",
    "#content",
    ".entry-content",
    ".category-typepost",
    ".type-post",
    "article",
  ]
    .map(function (selector) {
      return $(selector).toArray();
    })
    .reduce(function (all, next) {
      return all.concat(next);
    }, []);
  if (roots.length === 0) roots = [$("body").get(0)];
  var out = [];
  roots.forEach(function (root) {
    if ($(root).closest("header, nav, footer, aside").length > 0) return;
    $(root)
      .find("a[href][href!='']")
      .each(function (_i, anchor) {
        if ($(anchor).closest("header, nav, footer, aside").length > 0) return;
        var text = helper.formatString($(anchor).text());
        if (!text || text.length < 4) return;
        var link = helper.formatLink(pageUrl, $(anchor).attr("href"));
        if (seen[link]) return;
        if (!isPostLink(anchor, pageUrl, text)) return;
        seen[link] = true;
        out.push({ postName: text, date: null, link: link });
      });
  });
  return out;
}

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
      var link = helper.formatLink(pageUrl, anchor.attr("href"));
      if (link && helper.isHttpUrl(link)) {
        data.push({
          postName: helper.formatString(anchor.text()),
          date: date,
          link: link,
        });
      }
    }
  }

  if (data.length === 0) data = collectLinks($, pageUrl);

  var nextSelectors = [".nextpostslink", ".next.page-numbers", "a.next"];
  for (i = 0; i < nextSelectors.length; i++) {
    var nextEl = $(nextSelectors[i]).first();
    if (nextEl.length > 0 && nextEl.attr("href")) {
      next = helper.formatLink(
        pageUrl,
        helper.formatString(nextEl.attr("href"))
      );
      break;
    }
  }
  if (!next) {
    // WordPress archive pagination exposes numbered page links plus "Next".
    var seenPage = {};
    $(".page-numbers, .wp-pagenavi a").each(function (_i, el) {
      var that = $(el);
      var text = helper.formatString(that.text());
      var href = helper.formatLink(pageUrl, that.attr("href"));
      if (!href || !/next|»|→/i.test(text)) return;
      if (seenPage[href]) return;
      seenPage[href] = true;
      next = href;
    });
  }

  return { data: data, next: next };
}

module.exports.jobListUrl = "https://www.sarkariexam.com/category/hot-job";
module.exports.scrapJobList = scrapJobList;
// Correctly-spelled alias; the old name stays for backwards compatibility.
module.exports.scrapeJobList = scrapJobList;
