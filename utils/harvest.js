"use strict";

// Generic, content-driven extraction for beta/community parsers.
// Instead of fragile per-site CSS selectors (which break on every redesign),
// these helpers find links by what they ARE: article URLs, PDF files,
// headings. Site parsers stay thin: entry URL + tuning + tests.

var cheerio = require("cheerio");
var helper = require("./helper");

var DEFAULT_EXCLUDE =
  /(login|logout|register|signup|signin|contact|privacy|terms|about-us|advertise|sitemap|whatsapp|telegram(\.me|\.org)?|facebook|twitter|youtube|instagram|linkedin|play\.google|apps\.apple|applink|doubleclick|adsystem)/i;

var DATE_PATTERN =
  /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s*,?\s*\d{4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/;

function isSkippableHref(href) {
  if (!href) {
    return true;
  }
  var cleaned = String(href).trim();
  return (
    cleaned === "" ||
    cleaned.charAt(0) === "#" ||
    /^(javascript|mailto|tel|sms|whatsapp):/i.test(cleaned)
  );
}

function contextDate($, anchor) {
  var scopes = ["li", "td", "tr", "p", "div"];
  for (var i = 0; i < scopes.length; i++) {
    var parent = $(anchor).closest(scopes[i]);
    if (parent.length > 0) {
      var match = DATE_PATTERN.exec(parent.first().text() || "");
      if (match) {
        return helper.formatString(match[1]);
      }
    }
  }
  return null;
}

// Collect content links: { title, link, date }.
function harvestLinks(html, pageUrl, options) {
  options = options || {};
  var $ = cheerio.load(html);
  var include = options.includePattern || null;
  var exclude = options.excludePattern || DEFAULT_EXCLUDE;
  var minText = options.minText === undefined ? 12 : options.minText;
  var maxLinks = options.maxLinks || 200;
  var scope = options.scope || "body";

  var out = [];
  var seen = {};
  var anchors = $(scope).find("a[href]").toArray();
  var i;
  for (i = 0; i < anchors.length && out.length < maxLinks; i++) {
    var rawHref = $(anchors[i]).attr("href");
    if (isSkippableHref(rawHref)) {
      continue;
    }
    var link = helper.formatLink(pageUrl, rawHref);
    if (!helper.isHttpUrl(link)) {
      continue;
    }
    if (include && !include.test(link)) {
      continue;
    }
    if (exclude && exclude.test(link)) {
      continue;
    }
    if (seen[link]) {
      continue;
    }
    var title = helper.formatString($(anchors[i]).text());
    if (!title || title.length < minText) {
      continue;
    }
    seen[link] = true;
    out.push({ title: title, link: link, date: contextDate($, anchors[i]) });
  }
  return out;
}

// Collect PDF links: { title, pdfUrl }.
function harvestPdfLinks(html, pageUrl, options) {
  options = options || {};
  var $ = cheerio.load(html);
  var scope = options.scope || "body";
  var minText = options.minText === undefined ? 3 : options.minText;

  var out = [];
  var seen = {};
  var anchors = $(scope).find("a[href]").toArray();
  var i;
  for (i = 0; i < anchors.length; i++) {
    var rawHref = $(anchors[i]).attr("href");
    if (isSkippableHref(rawHref)) {
      continue;
    }
    var pdfUrl = helper.formatLink(pageUrl, rawHref);
    if (!helper.isHttpUrl(pdfUrl)) {
      continue;
    }
    var looksPdf =
      /\.pdf(\?|#|$)/i.test(pdfUrl) ||
      /download[^<>]{0,30}pdf|pdf[^<>]{0,30}download/i.test(
        $(anchors[i]).text() || ""
      );
    if (!looksPdf || seen[pdfUrl]) {
      continue;
    }
    var title =
      helper.formatString($(anchors[i]).text()) || pdfUrl.split("/").pop();
    if (!title || title.length < minText) {
      continue;
    }
    seen[pdfUrl] = true;
    out.push({ title: title, pdfUrl: pdfUrl });
  }
  return out;
}

// Collect PDF links grouped under their nearest preceding heading:
// [{ heading, links: [{ title, pdfUrl }] }]. Powers exam-wise pages
// (e.g. UPSC previous-question-papers) without site-specific selectors.
function harvestPdfGroups(html, pageUrl, options) {
  options = options || {};
  var $ = cheerio.load(html);
  var scope = options.scope || "body";
  var groups = [];
  var current = { heading: null, links: [] };

  function flush() {
    if (current.links.length > 0) {
      groups.push(current);
    }
  }

  var nodes = $(scope).find("h1, h2, h3, h4, a[href]").toArray();
  var i;
  for (i = 0; i < nodes.length; i++) {
    var tag = helper.tagName($, nodes[i]);
    if (tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4") {
      var heading = helper.formatString($(nodes[i]).text());
      if (heading) {
        flush();
        current = { heading: heading, links: [] };
      }
      continue;
    }
    var rawHref = $(nodes[i]).attr("href");
    if (isSkippableHref(rawHref)) {
      continue;
    }
    var pdfUrl = helper.formatLink(pageUrl, rawHref);
    if (!helper.isHttpUrl(pdfUrl) || !/\.pdf(\?|#|$)/i.test(pdfUrl)) {
      continue;
    }
    var already = current.links.some(function (entry) {
      return entry.pdfUrl === pdfUrl;
    });
    if (already) {
      continue;
    }
    var title =
      helper.formatString($(nodes[i]).text()) || pdfUrl.split("/").pop();
    current.links.push({ title: title, pdfUrl: pdfUrl });
  }
  flush();
  return groups;
}

module.exports.harvestLinks = harvestLinks;
module.exports.harvestPdfLinks = harvestPdfLinks;
module.exports.harvestPdfGroups = harvestPdfGroups;
