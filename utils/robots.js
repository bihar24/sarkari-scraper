"use strict";

// Minimal robots.txt support (dependency-free).
//
//  - Rules are fetched once per origin and cached.
//  - Only `User-agent` groups matching our crawler token or `*` apply.
//  - Longest Allow/Disallow prefix match wins; Allow wins ties.
//  - Any fetch/parse failure FAILS OPEN (allowed) with a reason, except an
//    explicit Disallow. Standard conservative-crawler behaviour.

var ROBOTS_MAX_BYTES = 256 * 1024;

function productToken(userAgent) {
  var match = /^[A-Za-z0-9-]+/.exec(userAgent || "");
  return match ? match[0].toLowerCase() : "";
}

function parseRobots(text, token) {
  var allows = [];
  var disallows = [];
  var inScope = false;
  var sawRule = false;

  var lines = String(text).split("\n");
  var i;
  for (i = 0; i < lines.length; i++) {
    var line = lines[i].split("#")[0].trim();
    if (line === "") {
      continue;
    }
    var sep = line.indexOf(":");
    if (sep === -1) {
      continue;
    }
    var key = line.slice(0, sep).trim().toLowerCase();
    var value = line.slice(sep + 1).trim();

    if (key === "user-agent") {
      var agent = value.toLowerCase();
      if (sawRule) {
        // A new group starts after rules were seen.
        inScope = false;
        sawRule = false;
      }
      if (agent === "*" || (token && agent === token)) {
        inScope = true;
      }
      continue;
    }
    if (!inScope) {
      continue;
    }
    if (key === "allow" && value !== "") {
      allows.push(value);
      sawRule = true;
    } else if (key === "disallow") {
      if (value !== "") {
        disallows.push(value);
      }
      sawRule = true;
    }
  }

  return { allows: allows, disallows: disallows };
}

function longestMatch(rules, path) {
  var best = -1;
  var i;
  for (i = 0; i < rules.length; i++) {
    if (path.indexOf(rules[i]) === 0 && rules[i].length > best) {
      best = rules[i].length;
    }
  }
  return best;
}

function isPathAllowed(rules, path) {
  var allowLen = longestMatch(rules.allows, path);
  var disallowLen = longestMatch(rules.disallows, path);
  if (disallowLen === -1) {
    return true;
  }
  return allowLen >= disallowLen; // Allow wins ties
}

function createRobotsChecker(options) {
  options = options || {};
  if (!options.client) {
    throw new Error("createRobotsChecker requires an HTTP client.");
  }
  var client = options.client;
  var token = productToken(options.userAgent);
  var cache = new Map();

  async function fetchRules(origin) {
    try {
      var response = await client.get(origin + "/robots.txt", {
        maxContentLength: ROBOTS_MAX_BYTES,
        timeout: options.timeoutMs || 10000,
      });
      if (response.status !== 200) {
        return { rules: null, reason: "robots.txt HTTP " + response.status };
      }
      var contentType = String(
        (response.headers && response.headers["content-type"]) || ""
      );
      var body =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);
      if (contentType !== "" && contentType.indexOf("text/") !== 0) {
        return { rules: null, reason: "robots.txt is not text" };
      }
      return { rules: parseRobots(body, token), reason: "rules applied" };
    } catch (err) {
      return { rules: null, reason: "robots.txt unreachable, failing open" };
    }
  }

  async function isAllowed(targetUrl) {
    var parsed = new URL(targetUrl);
    var origin = parsed.origin;
    var entry = cache.get(origin);
    if (!entry) {
      entry = await fetchRules(origin);
      cache.set(origin, entry);
    }
    if (!entry.rules) {
      return { allowed: true, reason: entry.reason };
    }
    var path = parsed.pathname || "/";
    var allowed = isPathAllowed(entry.rules, path);
    return {
      allowed: allowed,
      reason: allowed ? "allowed by robots.txt" : "disallowed by robots.txt",
    };
  }

  return { isAllowed: isAllowed };
}

module.exports.createRobotsChecker = createRobotsChecker;
module.exports.parseRobots = parseRobots;
module.exports.isPathAllowed = isPathAllowed;
