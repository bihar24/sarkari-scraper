"use strict";

// A historical directory is a discovery aid, NEVER a network allowlist or
// proof of government ownership. Matching is exact, not substring/suffix.
var net = require("node:net");

var GIST_URL =
  "https://gist.github.com/captn3m0/4f3da8f07fe884e62bfab3ac85616936";
var GIST_REVISION = "27f26717533ba451e56a8769fb0eb224605c12a5";
var GIST_RAW =
  "https://gist.githubusercontent.com/captn3m0/4f3da8f07fe884e62bfab3ac85616936/raw/" +
  GIST_REVISION +
  "/01-domains.md";

function hostname(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  var raw = value.trim();
  if (!raw || /[\s\\]/.test(raw)) return null;
  var host;
  try {
    var url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : "https://" + raw);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
      return null;
    }
    host = url.hostname.toLowerCase().replace(/\.$/, "");
  } catch (err) {
    return null;
  }
  if (host.length > 253 || net.isIP(host) || host.indexOf(".") === -1) {
    return null;
  }
  if (
    !host.split(".").every(function (label) {
      return (
        label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
      );
    })
  )
    return null;
  return host;
}

function namespace(host) {
  if (host && /(^|\.)gov\.in$/.test(host)) return "gov.in";
  if (host && /(^|\.)nic\.in$/.test(host)) return "nic.in";
  return null;
}

function classify(value, directory) {
  var host = hostname(value);
  var entries = directory instanceof Set ? directory : new Set(directory || []);
  var space = namespace(host);
  return {
    hostname: host,
    namespace: space,
    directoryListed: Boolean(host && entries.has(host)),
    classification: space
      ? "government_namespace"
      : entries.has(host)
        ? "historical_directory"
        : "unclassified",
    ownershipVerified: false,
  };
}

function parseDirectory(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 2 * 1024 * 1024) {
    throw new Error("Domain directory must be text smaller than 2 MB.");
  }
  var domains = new Set();
  var invalid = 0;
  var duplicates = 0;
  text.split(/\r?\n/).forEach(function (line) {
    var raw = line.trim();
    if (!raw || raw.charAt(0) === "#") return;
    raw = raw.replace(/^[-*+]\s+/, "");
    var markdown = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(raw);
    if (markdown) raw = markdown[2];
    // Plain directory lines are domains or URLs, not arbitrary prose.
    var host = hostname(raw);
    if (!host || /\*/.test(raw)) {
      invalid += 1;
      return;
    }
    if (domains.has(host)) duplicates += 1;
    domains.add(host);
  });
  if (domains.size > 30000)
    throw new Error("Domain directory exceeds 30,000 entries.");
  if (!domains.size)
    throw new Error("No valid domains found; previous directory retained.");
  return {
    domains: Array.from(domains).sort(),
    invalid: invalid,
    duplicates: duplicates,
  };
}

module.exports = {
  hostname: hostname,
  namespace: namespace,
  classify: classify,
  parseDirectory: parseDirectory,
  GIST_URL: GIST_URL,
  GIST_REVISION: GIST_REVISION,
  GIST_RAW: GIST_RAW,
};
