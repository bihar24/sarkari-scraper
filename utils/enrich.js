"use strict";

// Opt-in enrichments powered by free, keyless public APIs (see
// docs/INTEGRATIONS.md for the full menu and credits).
//
// Every function is FAIL-SOFT: any transport/API/quota problem returns null
// and the digest falls back to plain scraped data. `options.baseUrl`
// overrides the real host so tests run against local stub servers.

var fs = require("fs");
var http = require("./http");

var MYMEMORY_BASE = "https://api.mymemory.translated.net";
var POLLINATIONS_BASE = "https://text.pollinations.ai";
var PINCODE_BASE = "https://api.postalpincode.in";
var NAGER_BASE = "https://date.nager.at";
var WAYBACK_BASE = "https://web.archive.org";
var CLEANURI_BASE = "https://cleanuri.com";
var CATBOX_BASE = "https://catbox.moe";

function noop() {
  // enrichment failures are routine; callers log at debug when curious
}

function baseOf(options, fallback) {
  return (options && options.baseUrl) || fallback;
}

function logOf(options) {
  return (options && options.log) || noop;
}

// --- Translation (MyMemory, 5k chars/day anonymous, 50k with email) ---

function translateError(text) {
  return /LIMIT EXCEEDED|INVALID EMAIL|INVALID TARGET|MYMEMORY WARNING|NO QUERY SPECIFIED/i.test(
    String(text || "")
  );
}

async function translateText(client, text, lang, options) {
  options = options || {};
  var log = logOf(options);
  try {
    if (!/^[a-z]{2}(-[a-zA-Z]{2,})?$/.test(String(lang || ""))) {
      return null;
    }
    var query = String(text || "")
      .trim()
      .slice(0, 450);
    if (!query) {
      return null;
    }
    var params = { q: query, langpair: "en|" + lang.toLowerCase() };
    if (options.email) {
      params.de = options.email;
    }
    var response = await client.get(baseOf(options, MYMEMORY_BASE) + "/get", {
      params: params,
    });
    var data = response.data || {};
    if (String(data.responseStatus) !== "200") {
      log("translate: status " + data.responseStatus);
      return null;
    }
    var out = data.responseData && data.responseData.translatedText;
    if (!out || translateError(out)) {
      log("translate: quota/error response");
      return null;
    }
    return String(out).trim() || null;
  } catch (err) {
    log("translate failed: " + http.describeError(err));
    return null;
  }
}

// --- AI summaries (Pollinations, keyless plain-text endpoint) ---

async function summarizeJob(client, text, options) {
  options = options || {};
  var log = logOf(options);
  try {
    var excerpt = String(text || "")
      .trim()
      .slice(0, 1500);
    if (!excerpt) {
      return null;
    }
    var prompt =
      "Summarize this Indian government job posting in 2 short lines " +
      "(role, vacancies, last date if present). Plain text, no preamble:\n\n" +
      excerpt;
    var response = await client.get(
      baseOf(options, POLLINATIONS_BASE) + "/" + encodeURIComponent(prompt),
      { params: { model: options.model || "openai" } }
    );
    if (typeof response.data !== "string") {
      return null;
    }
    var out = response.data.trim().slice(0, 600);
    return out || null;
  } catch (err) {
    log("summarize failed: " + http.describeError(err));
    return null;
  }
}

// --- Pincode -> district/state (api.postalpincode.in) ---

async function lookupPincode(client, pin, options) {
  options = options || {};
  var log = logOf(options);
  try {
    if (!/^[1-9]\d{5}$/.test(String(pin || ""))) {
      return null;
    }
    var response = await client.get(
      baseOf(options, PINCODE_BASE) + "/pincode/" + pin
    );
    var first = Array.isArray(response.data) ? response.data[0] : null;
    var offices =
      first && Array.isArray(first.PostOffice) ? first.PostOffice : [];
    if (!first || first.Status !== "Success" || offices.length === 0) {
      return null;
    }
    return {
      pin: String(pin),
      district: offices[0].District || null,
      state: offices[0].State || null,
      offices: offices.length,
    };
  } catch (err) {
    log("pincode lookup failed: " + http.describeError(err));
    return null;
  }
}

// --- Public holidays (Nager.Date, keyless) ---

async function fetchHolidays(client, year, country, options) {
  options = options || {};
  var log = logOf(options);
  try {
    var code = String(country || "IN").toUpperCase();
    if (!/^\d{4}$/.test(String(year)) || !/^[A-Z]{2}$/.test(code)) {
      return null;
    }
    var response = await client.get(
      baseOf(options, NAGER_BASE) +
        "/api/v3/publicholidays/" +
        year +
        "/" +
        code
    );
    if (!Array.isArray(response.data)) {
      return null;
    }
    return response.data.map(function (entry) {
      return {
        date: entry.date,
        name: entry.name || entry.localName,
        localName: entry.localName || entry.name,
      };
    });
  } catch (err) {
    log("holidays fetch failed: " + http.describeError(err));
    return null;
  }
}

// --- Wayback Machine snapshots (Internet Archive, keyless) ---

async function archivePage(client, url, options) {
  options = options || {};
  var log = logOf(options);
  try {
    if (!/^https?:\/\//i.test(String(url || ""))) {
      return null;
    }
    var response = await client.get(
      baseOf(options, WAYBACK_BASE) + "/save/" + url,
      {
        timeout: 45000,
        maxRedirects: 5,
      }
    );
    var snapshot = http.finalUrl(response);
    if (snapshot && /\/web\/\d+\//.test(snapshot)) {
      return snapshot;
    }
    return null;
  } catch (err) {
    log("archive failed: " + http.describeError(err));
    return null;
  }
}

// --- URL shortening (CleanURI, keyless, 2 req/s) ---

async function shortenUrl(client, url, options) {
  options = options || {};
  var log = logOf(options);
  try {
    if (!/^https?:\/\//i.test(String(url || "").trim())) {
      return null;
    }
    var body = new URLSearchParams({ url: String(url).trim() });
    var response = await client.post(
      baseOf(options, CLEANURI_BASE) + "/api/v1/shorten",
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    var short = response.data && response.data.result_url;
    if (short && /^https?:\/\//i.test(String(short))) {
      return String(short);
    }
    return null;
  } catch (err) {
    log("shorten failed: " + http.describeError(err));
    return null;
  }
}

// --- File publishing (Catbox, keyless, permanent links) ---

async function uploadFile(client, filePath, options) {
  options = options || {};
  var log = logOf(options);
  try {
    var buffer = fs.readFileSync(filePath);
    var form = new FormData();
    form.append("reqtype", "fileupload");
    form.append(
      "fileToUpload",
      new Blob([buffer], { type: "application/octet-stream" }),
      options.filename || "digest.json"
    );
    var response = await client.post(
      baseOf(options, CATBOX_BASE) + "/user/api.php",
      form,
      { timeout: 60000 }
    );
    var link = String(response.data || "").trim();
    if (/^https?:\/\//i.test(link)) {
      return link;
    }
    return null;
  } catch (err) {
    log("upload failed: " + http.describeError(err));
    return null;
  }
}

module.exports.translateText = translateText;
module.exports.summarizeJob = summarizeJob;
module.exports.lookupPincode = lookupPincode;
module.exports.fetchHolidays = fetchHolidays;
module.exports.archivePage = archivePage;
module.exports.shortenUrl = shortenUrl;
module.exports.uploadFile = uploadFile;
