"use strict";

// BETA source (see docs/SOURCES.md): parses shift-wise PDF tables shaped like
// | Exam Date | Shift | English | Hindi | (2-col variants supported too).
// Empty date cells inherit the previous row's date (rowspan-style tables).

var cheerio = require("cheerio");
var helper = require("../../utils/helper");

function columnRoles($, table) {
  var headerRow = $(table).find("thead tr").first();
  if (headerRow.length === 0) {
    headerRow = $(table).find("tr").first();
  }
  var roles = [];
  headerRow
    .find("th, td")
    .toArray()
    .forEach(function (cell) {
      var text = helper.formatString($(cell).text()) || "";
      if (/hindi/i.test(text)) {
        roles.push("hindi");
      } else if (/english/i.test(text)) {
        roles.push("english");
      } else if (/shift/i.test(text)) {
        roles.push("shift");
      } else if (/date/i.test(text)) {
        roles.push("date");
      } else {
        roles.push("pdf");
      }
    });
  return { roles: roles, headerRow: headerRow };
}

function languageOf(role, href, text) {
  if (role === "hindi" || /hindi/i.test(href + " " + text)) {
    return "Hindi";
  }
  if (role === "english") {
    return "English";
  }
  return null;
}

function tablePapers($, table, pageUrl) {
  var mapped = columnRoles($, table);
  var roles = mapped.roles;
  var papers = [];
  var lastDate = null;

  $(table)
    .find("tr")
    .toArray()
    .forEach(function (tr) {
      if (tr === mapped.headerRow.get(0)) {
        return;
      }
      var cells = $(tr).find("td").toArray();
      if (cells.length === 0) {
        return;
      }
      var date = null;
      var shift = null;
      var pdfCells = [];
      cells.forEach(function (cell, index) {
        var role = roles[index] || "pdf";
        if (role === "date") {
          date = helper.formatString($(cell).text());
        } else if (role === "shift") {
          shift = helper.formatString($(cell).text());
        } else {
          pdfCells.push({ cell: cell, role: role });
        }
      });
      if (date) {
        lastDate = date;
      } else {
        date = lastDate;
      }
      pdfCells.forEach(function (entry) {
        $(entry.cell)
          .find("a[href]")
          .toArray()
          .forEach(function (anchor) {
            var link = helper.formatLink(pageUrl, $(anchor).attr("href"));
            if (!helper.isHttpUrl(link)) {
              return;
            }
            var lang = languageOf(entry.role, link, $(anchor).text());
            var label = [
              date,
              shift ? "Shift " + shift : null,
              lang ? "(" + lang + ")" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            papers.push({
              text: label || helper.formatString($(anchor).text()) || link,
              link: link,
            });
          });
      });
    });
  return papers;
}

function scrapPaperDetail(html, url) {
  var $ = cheerio.load(html);
  var data = [
    {
      key: "Post Link",
      value: [{ text: "Link", link: url }],
      type: "Link",
    },
  ];

  var exam = helper.formatString($("h1").first().text());
  if (exam) {
    data.push({ key: "Exam", value: exam, type: "String" });
  }

  var seen = {};
  $("h2, h3")
    .toArray()
    .forEach(function (heading) {
      var section = helper.formatString($(heading).text());
      if (!section || seen[section]) {
        return;
      }
      seen[section] = true;
      var papers = [];
      var node = $(heading).next();
      while (node.length > 0 && !/^h[123]$/i.test(node.prop("tagName") || "")) {
        if (helper.tagName($, node.get(0)) === "TABLE") {
          papers.push.apply(papers, tablePapers($, node, url));
        }
        node = node.next();
      }
      if (papers.length > 0) {
        data.push({ key: section, value: papers, type: "Link" });
      }
    });

  return data;
}

module.exports.scrapPaperDetail = scrapPaperDetail;
module.exports.scrapePaperDetail = scrapPaperDetail;
