"use strict";

// BETA source (see docs/SOURCES.md): groups the page's PDF links under
// their exam headings. Works on both the full listing and the
// ?field_exam_name_value= filtered views.

var harvest = require("../../utils/harvest");

function scrapPaperDetail(html, url) {
  var data = [
    {
      key: "Post Link",
      value: [{ text: "Link", link: url }],
      type: "Link",
    },
  ];
  var groups = harvest.harvestPdfGroups(html, url);
  groups.forEach(function (group) {
    data.push({
      key: group.heading || "Papers",
      value: group.links.map(function (entry) {
        return { text: entry.title, link: entry.pdfUrl };
      }),
      type: "Link",
    });
  });
  return data;
}

module.exports.scrapPaperDetail = scrapPaperDetail;
module.exports.scrapePaperDetail = scrapPaperDetail;
