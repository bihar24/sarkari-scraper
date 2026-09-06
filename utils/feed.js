"use strict";

// RSS/Atom feed input: turns job-portal feeds into digest jobs so users can
// alert on sources we have no scraper for. Accepts any feed URL (RSS 2.0,
// Atom, RDF) — items become { url, detail } jobs and flow through the same
// diff/enrich/alert pipeline as scraped jobs.

var cheerio = require("cheerio");
var helper = require("./helper");

var MAX_SUMMARY = 2000;

// Direct-child lookup by tag name (namespace-proof: works for
// <content:encoded> where CSS selectors would choke on the colon).
function childTexts($, root, wanted) {
  var out = [];
  $(root)
    .children()
    .each(function (_i, el) {
      var name = String($(el).prop("tagName") || "").toLowerCase();
      if (wanted.indexOf(name) !== -1) {
        var text = helper.formatString($(el).text());
        if (text) {
          out.push({ name: name, el: el, text: text });
        }
      }
    });
  return out;
}

function firstChildText($, root, wanted) {
  var found = childTexts($, root, wanted);
  return found.length > 0 ? found[0].text : null;
}

function stripHtml(html) {
  if (!html) {
    return null;
  }
  var $frag = cheerio.load("<div>" + String(html) + "</div>");
  var text = helper.formatString($frag("div").text());
  if (!text) {
    return null;
  }
  return text.replace(/\s+/g, " ").slice(0, MAX_SUMMARY) || null;
}

function rssItem($, item) {
  var link =
    firstChildText($, item, ["link"]) ||
    firstChildText($, item, ["guid"]) ||
    null;
  return {
    title: firstChildText($, item, ["title"]),
    link: link,
    published: firstChildText($, item, ["pubdate", "date", "updated"]),
    summary: stripHtml(
      firstChildText($, item, [
        "description",
        "content:encoded",
        "content",
        "summary",
      ])
    ),
    categories: childTexts($, item, ["category"]).map(function (entry) {
      return entry.text;
    }),
  };
}

function atomEntry($, entry) {
  // Atom <link> elements are usually empty (<link href="…"/>), so scan
  // elements directly instead of going through the text-only childTexts.
  var linkEls = [];
  $(entry)
    .children()
    .each(function (_i, el) {
      if (String($(el).prop("tagName") || "").toLowerCase() === "link") {
        linkEls.push(el);
      }
    });
  var link = null;
  var i;
  for (i = 0; i < linkEls.length && !link; i++) {
    var rel = String($(linkEls[i]).attr("rel") || "alternate").toLowerCase();
    if (rel === "alternate") {
      link =
        helper.formatString($(linkEls[i]).attr("href")) ||
        helper.formatString($(linkEls[i]).text());
    }
  }
  if (!link && linkEls.length > 0) {
    link =
      helper.formatString($(linkEls[0]).attr("href")) ||
      helper.formatString($(linkEls[0]).text()) ||
      null;
  }
  var categories = [];
  $(entry)
    .children()
    .each(function (_i, el) {
      if (String($(el).prop("tagName") || "").toLowerCase() !== "category") {
        return;
      }
      var label =
        helper.formatString($(el).attr("label")) ||
        helper.formatString($(el).attr("term")) ||
        helper.formatString($(el).text());
      if (label) {
        categories.push(label);
      }
    });
  return {
    title: firstChildText($, entry, ["title"]),
    link: link,
    published: firstChildText($, entry, ["published", "updated"]),
    summary: stripHtml(
      firstChildText($, entry, ["summary", "content", "description"])
    ),
    categories: categories,
  };
}

function parseFeedXml(xml) {
  var $ = cheerio.load(String(xml || ""), { xmlMode: true });
  var items = [];
  var format = null;
  if ($("channel > item").length > 0 || $("rss").length > 0) {
    format = "rss";
    $("item")
      .toArray()
      .forEach(function (item) {
        items.push(rssItem($, item));
      });
  } else if ($("feed").length > 0 || $("entry").length > 0) {
    format = "atom";
    $("entry")
      .toArray()
      .forEach(function (entry) {
        items.push(atomEntry($, entry));
      });
  } else if ($("item").length > 0) {
    // RDF (RSS 1.0) has bare <item> elements without <channel> wrappers.
    format = "rss";
    $("item")
      .toArray()
      .forEach(function (item) {
        items.push(rssItem($, item));
      });
  }
  return { format: format, items: items };
}

function itemsToJobs(items) {
  var jobs = [];
  var skipped = 0;
  (items || []).forEach(function (item) {
    var link = item && helper.formatString(item.link);
    if (!link || !helper.isHttpUrl(link)) {
      skipped += 1;
      return;
    }
    var detail = [
      {
        key: "Post Link",
        value: [{ text: "Link", link: link }],
        type: "Link",
      },
    ];
    if (item.title) {
      detail.push({ key: "Title", value: item.title, type: "String" });
    }
    if (item.published) {
      detail.push({ key: "Published", value: item.published, type: "String" });
    }
    if (item.summary) {
      detail.push({ key: "Summary", value: [item.summary], type: "Paragraph" });
    }
    if (item.categories && item.categories.length > 0) {
      detail.push({ key: "Categories", value: item.categories, type: "List" });
    }
    jobs.push({ url: link, detail: detail });
  });
  return { jobs: jobs, skipped: skipped };
}

async function fetchFeed(client, url) {
  var response = await client.get(url);
  var parsed = parseFeedXml(response.data);
  if (!parsed.format) {
    throw new Error("not a recognized RSS/Atom feed: " + url);
  }
  return itemsToJobs(parsed.items);
}

module.exports.parseFeedXml = parseFeedXml;
module.exports.itemsToJobs = itemsToJobs;
module.exports.fetchFeed = fetchFeed;
