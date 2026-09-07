"use strict";

// Entirely authored fixtures; NOT imported tracker data or real opportunities.
var store = require("./store");

function demoCatalogue() {
  var stamp = new Date().toISOString();
  var day = new Date(Date.now() + 18 * 86400000).toISOString().slice(0, 10);
  var definitions = [
    [
      "scheme",
      "Student learning support — example",
      "छात्र अध्ययन सहायता — उदाहरण",
      "education",
      "A sample education-support record showing bilingual information, eligibility and source provenance.",
      "student",
    ],
    [
      "job",
      "Graduate trainee recruitment — example",
      "स्नातक प्रशिक्षु भर्ती — उदाहरण",
      "employment",
      "An illustrative job card. Import a real scraper output to replace these examples.",
      "unemployed_youth",
    ],
    [
      "scheme",
      "Women’s enterprise support — example",
      "महिला उद्यम सहायता — उदाहरण",
      "industry",
      "A fictional entrepreneurship programme demonstrating the scheme discovery experience.",
      "self_employed_entrepreneur",
    ],
    [
      "paper",
      "Previous-year examination papers — example",
      "पिछले वर्षों के प्रश्नपत्र — उदाहरण",
      "education",
      "A sample paper collection. The scraper extracts document links, not the contents of PDFs.",
      "student",
    ],
    [
      "scheme",
      "Sustainable farming support — example",
      "टिकाऊ खेती सहायता — उदाहरण",
      "agriculture",
      "Explore how agricultural support records can be searched without making eligibility promises.",
      "farmer",
    ],
    [
      "policy",
      "Skills and employment framework — example",
      "कौशल और रोजगार नीति — उदाहरण",
      "skilling",
      "A fictional policy record illustrating source dates and consultation information.",
      "",
    ],
  ];
  var records = definitions.map(function (d, i) {
    return {
      schemaVersion: 1,
      id: "demo:" + i,
      kind: d[0],
      title: { en: d[1], hi: d[2] },
      summary: {
        en: d[4],
        hi: "यह केवल डेमो डेटा है, वास्तविक सरकारी अवसर नहीं।",
      },
      categories: [d[3]],
      region: i % 2 ? "india" : "bihar",
      url: "https://example.org/sarkari-demo/" + i,
      applyUrl: null,
      status: "unverified",
      evidence:
        "Demonstration only. No eligibility, funding or active status is asserted.",
      deadline:
        d[0] === "job" ? { date: day, raw: day, purpose: "application" } : null,
      department: { en: "Illustrative catalogue", hi: "उदाहरण सूची" },
      benefits: { en: null, hi: null },
      links: [],
      eligibility:
        d[0] === "scheme"
          ? {
              text: {
                en: "Example criteria only. Never use this record to determine eligibility.",
                hi: null,
              },
              personas: d[5] ? [d[5]] : [],
              minAge: null,
              maxAge: null,
              incomeCeiling: null,
            }
          : null,
      source: {
        provider: "demo",
        url: "https://example.org/sarkari-demo/" + i,
        recordUrl: "https://example.org/sarkari-demo/" + i,
        fetchedAt: stamp,
        lastVerified: null,
        revision: null,
        license: "MIT",
        attribution: null,
      },
      original: { demo: true },
    };
  });
  var catalogue = store.empty();
  catalogue.demo = true;
  store.applyGroup(
    catalogue,
    {
      key: "demo",
      label: "Illustrative examples — not live data",
      records: records,
      license: "MIT",
      replace: true,
    },
    stamp
  );
  return catalogue;
}

module.exports = { demoCatalogue: demoCatalogue };
