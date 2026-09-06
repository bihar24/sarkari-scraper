"use strict";

// Minimal RSS 2.0 feed builder for job digests.

function stripIllegalXmlChars(text) {
  // XML 1.0 forbids C0 controls (minus tab/LF/CR) and DEL; scraped text can
  // contain them. Char-code loop instead of a regex: no control-regex
  // lint issues, no invisible characters in source.
  var out = "";
  var i;
  for (i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    var illegal =
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f;
    if (!illegal) {
      out += text[i];
    }
  }
  return out;
}

function escapeXml(text) {
  return stripIllegalXmlChars(String(text))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pubDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toUTCString();
  }
  return new Date().toUTCString();
}

function buildRss(channel) {
  channel = channel || {};
  var items = Array.isArray(channel.items) ? channel.items : [];
  var lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "<channel>",
    "<title>" + escapeXml(channel.title || "Sarkari job digest") + "</title>",
    "<link>" + escapeXml(channel.link || "") + "</link>",
    "<description>" +
      escapeXml(channel.description || "Latest government job postings") +
      "</description>",
    "<lastBuildDate>" + pubDate(channel.builtAt) + "</lastBuildDate>",
  ];
  items.forEach(function (item) {
    lines.push(
      "<item>",
      "<title>" + escapeXml(item.title || "(untitled)") + "</title>",
      "<link>" + escapeXml(item.link || "") + "</link>",
      '<guid isPermaLink="false">' +
        escapeXml(item.guid || item.link || "") +
        "</guid>",
      "<description>" + escapeXml(item.description || "") + "</description>",
      "<pubDate>" + pubDate(item.pubDate) + "</pubDate>",
      "</item>"
    );
  });
  lines.push("</channel>", "</rss>");
  return lines.join("\n") + "\n";
}

module.exports.buildRss = buildRss;
module.exports.escapeXml = escapeXml;
