"use strict";

function isObjectEmpty(obj) {
  if (!obj || typeof obj !== "object") {
    return true;
  }
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  return true;
}

// A scraped record is only worth keeping when it carries a usable key
// and/or value. Plain isObjectEmpty() is not enough here because records
// shaped like { key: null, value: null, type: "String" } have keys but no
// content.
function hasUsableValue(value) {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

function isDataEmpty(data) {
  if (!data || typeof data !== "object" || isObjectEmpty(data)) {
    return true;
  }
  var hasKey = hasUsableValue(data.key);
  var hasValue = hasUsableValue(data.value);
  return !hasKey && !hasValue;
}

function normalizeWhitespace(str) {
  return String(str).replace(/\s+/g, " ").trim();
}

function formatString(str) {
  if (str === undefined || str === null) {
    return null;
  }
  var out = normalizeWhitespace(str);
  return out === "" ? null : out;
}

function formatKey(str) {
  if (str === undefined || str === null) {
    return null;
  }
  var out = normalizeWhitespace(String(str).replace(/:/g, ""));
  return out === "" ? null : out;
}

// Resolve an href found in page HTML into an absolute URL. Returns the
// cleaned-up input when no base page URL is known (or resolution fails),
// so callers keep working with old fixture-style inputs.
function formatLink(baseUrl, href) {
  var raw = formatString(href);
  if (!raw || !baseUrl) {
    return raw;
  }
  try {
    return new URL(raw, baseUrl).toString();
  } catch (err) {
    return raw;
  }
}

// Upper-cased tag name ("" when unknown). Cheerio has returned both cases
// across versions, so compare case-insensitively through this helper.
function tagName($, elem) {
  if (!elem) {
    return "";
  }
  try {
    var name = $(elem).prop("tagName");
    return typeof name === "string" ? name.toUpperCase() : "";
  } catch (err) {
    return "";
  }
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function isHttpUrl(value) {
  if (typeof value !== "string") {
    return false;
  }
  try {
    var protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch (err) {
    return false;
  }
}

// True when `value` is an http(s) URL on `domain` or one of its subdomains.
// Used to keep the crawler from wandering (or being led) off-site.
function isSameSite(value, domain) {
  if (typeof value !== "string" || typeof domain !== "string") {
    return false;
  }
  try {
    var host = new URL(value).hostname.toLowerCase();
    var base = domain.toLowerCase().replace(/^www\./, "");
    return host === base || host.endsWith("." + base);
  } catch (err) {
    return false;
  }
}

module.exports.isObjectEmpty = isObjectEmpty;
module.exports.isDataEmpty = isDataEmpty;
module.exports.formatKey = formatKey;
module.exports.formatString = formatString;
module.exports.formatLink = formatLink;
module.exports.tagName = tagName;
module.exports.sleep = sleep;
module.exports.isHttpUrl = isHttpUrl;
module.exports.isSameSite = isSameSite;
