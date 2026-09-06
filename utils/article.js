"use strict";

// Generic article-page reader for beta job-detail parsers. Extracts the
// title, headed sections (paragraphs / lists / tables / link boxes) into the
// standard [{ key, value, type }] record shape without site-specific CSS.

var cheerio = require("cheerio");
var helper = require("./helper");

var DEFAULT_ROOTS = [
  "article",
  "main",
  "#content",
  ".post-content",
  ".entry-content",
  ".td-post-content",
  "#post",
];

var MAX_TABLE_ROWS = 100;
var MAX_TABLE_COLS = 20;
var MAX_RECORDS = 200;

function cellValue($, cell, pageUrl) {
  var anchors = $(cell).find("a[href]").toArray();
  if (anchors.length > 0) {
    var links = [];
    anchors.forEach(function (anchor) {
      var href = $(anchor).attr("href");
      if (!href || /^(javascript|mailto|tel):/i.test(href)) {
        return;
      }
      links.push({
        text: helper.formatString($(anchor).text()),
        link: helper.formatLink(pageUrl, href),
      });
    });
    if (links.length > 0) {
      return { value: links, type: "Link" };
    }
  }
  return { value: helper.formatString($(cell).text()), type: "String" };
}

function tableRecords($, table, pageUrl) {
  var rows = [];
  var trs = $(table).find("tr").toArray().slice(0, MAX_TABLE_ROWS);
  trs.forEach(function (tr) {
    var cells = [];
    $(tr)
      .find("th, td")
      .toArray()
      .slice(0, MAX_TABLE_COLS)
      .forEach(function (cell) {
        cells.push(cellValue($, cell, pageUrl));
      });
    if (cells.length > 0) {
      rows.push(cells);
    }
  });
  return rows;
}

function listItems($, list) {
  var items = [];
  $(list)
    .find("li")
    .toArray()
    .forEach(function (li) {
      var text = helper.formatString($(li).text());
      if (text) {
        items.push(text);
      }
    });
  return items;
}

function linkItems($, root, pageUrl) {
  var links = [];
  $(root)
    .find("a[href]")
    .toArray()
    .forEach(function (anchor) {
      var href = $(anchor).attr("href");
      if (!href || /^(javascript|mailto|tel|#)/i.test(href)) {
        return;
      }
      var text = helper.formatString($(anchor).text());
      if (!text) {
        return;
      }
      links.push({ text: text, link: helper.formatLink(pageUrl, href) });
    });
  return links;
}

function pickRoot($, roots) {
  var candidates = roots && roots.length > 0 ? roots : DEFAULT_ROOTS;
  for (var i = 0; i < candidates.length; i++) {
    var found = $(candidates[i]).first();
    if (found.length > 0 && helper.formatString(found.text())) {
      return found;
    }
  }
  return $("body");
}

// Sections: every h2/h3 starts a record; following siblings until the next
// heading become its value (tables win over lists over paragraphs).
function extractSections($, root, pageUrl) {
  var records = [];
  var headings = $(root).find("h2, h3").toArray();
  var i;
  for (i = 0; i < headings.length && records.length < MAX_RECORDS; i++) {
    var key = helper.formatKey($(headings[i]).text());
    if (!key) {
      continue;
    }
    var tables = [];
    var lists = [];
    var linkLists = [];
    var paras = [];
    var node = $(headings[i]).next();
    while (
      node.length > 0 &&
      !/^(h1|h2|h3)$/i.test(node.prop("tagName") || "")
    ) {
      var tag = helper.tagName($, node.get(0));
      if (tag === "TABLE") {
        tables.push(tableRecords($, node, pageUrl));
      } else if (tag === "UL" || tag === "OL") {
        var items = listItems($, node);
        if (items.length > 0) {
          lists.push(items);
        }
      } else if (tag === "P" || tag === "DIV") {
        var links = linkItems($, node, pageUrl);
        var text = helper.formatString($(node).text());
        if (links.length > 0 && text && text.length < 400) {
          linkLists.push(links);
        } else if (text) {
          paras.push(text);
        }
      }
      node = node.next();
    }
    var record = { key: key };
    if (tables.length > 0 && tables[0].length > 0) {
      record.value = tables[0];
      record.type = "Table";
    } else if (linkLists.length > 0) {
      var linkValues = [];
      linkLists.forEach(function (part) {
        linkValues.push.apply(linkValues, part);
      });
      record.value = linkValues;
      record.type = "Link";
    } else if (lists.length > 0) {
      var flat = [];
      lists.forEach(function (part) {
        flat.push.apply(flat, part);
      });
      record.value = flat;
      record.type = "List";
    } else if (paras.length > 0) {
      record.value = paras;
      record.type = "Paragraph";
    } else {
      continue;
    }
    if (!helper.isDataEmpty(record)) {
      records.push(record);
    }
  }
  return records;
}

function extractArticle(html, pageUrl, options) {
  options = options || {};
  var $ = cheerio.load(html);
  var data = [];

  data.push({
    key: "Post Link",
    value: [{ text: "Link", link: pageUrl }],
    type: "Link",
  });

  var root = pickRoot($, options.roots);
  var title =
    helper.formatString($(root).find("h1").first().text()) ||
    helper.formatString($("h1").first().text()) ||
    helper.formatString($("title").first().text());
  if (title) {
    data.push({ key: "Title", value: title, type: "String" });
  }

  var sections = extractSections($, root, pageUrl);
  sections.forEach(function (record) {
    data.push(record);
  });

  return data;
}

module.exports.extractArticle = extractArticle;
