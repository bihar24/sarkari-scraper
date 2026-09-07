"use strict";

var axios = require("axios");
var constant = require("./constant");

// Proxy resolution: explicit --proxy wins, otherwise the standard
// HTTPS_PROXY/HTTP_PROXY env vars, minus NO_PROXY matches.
function noProxyMatch(host, noProxy) {
  if (!noProxy) {
    return false;
  }
  var cleaned = String(host).toLowerCase();
  var entries = String(noProxy)
    .split(",")
    .map(function (entry) {
      return entry.trim().toLowerCase();
    })
    .filter(function (entry) {
      return entry !== "";
    });
  return entries.some(function (entry) {
    if (entry === "*") {
      return true;
    }
    var suffix = entry.replace(/^\./, "");
    return cleaned === suffix || cleaned.endsWith("." + suffix);
  });
}

function resolveProxy(proxyUrl) {
  var raw =
    proxyUrl ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!raw) {
    return { proxy: false, via: null };
  }
  var parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    throw new Error("Invalid proxy URL (value redacted).");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Proxy URL must use http(s) (value redacted).");
  }
  var config = {
    protocol: parsed.protocol.replace(":", ""),
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 8080,
  };
  if (parsed.username) {
    config.auth = {
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  }
  return { proxy: config, via: parsed.origin };
}

function createClient(options) {
  options = options || {};
  var resolved = resolveProxy(options.proxyUrl);
  var client = axios.create({
    timeout:
      options.timeoutMs === undefined
        ? constant.REQUEST_TIMEOUT_MS
        : options.timeoutMs,
    maxRedirects: 5,
    maxContentLength: 20 * 1024 * 1024, // 20 MB backstop per page
    proxy: resolved.proxy,
    headers: {
      "User-Agent": options.userAgent || constant.USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  // NO_PROXY can't be expressed in axios config, so bypass per-request.
  if (resolved.proxy) {
    client.interceptors.request.use(function (config) {
      try {
        var target = new URL(config.url, config.baseURL).hostname;
        if (
          noProxyMatch(target, process.env.NO_PROXY || process.env.no_proxy)
        ) {
          config.proxy = false;
        }
      } catch (err) {
        // unparseable URL: let the request fail naturally downstream
      }
      return config;
    });
  }
  client.__proxyVia = resolved.via;
  return client;
}

// Best-effort final URL of a response (after redirects).
function finalUrl(response) {
  try {
    var viaNode =
      response &&
      response.request &&
      response.request.res &&
      response.request.res.responseUrl;
    if (viaNode) {
      return viaNode;
    }
  } catch (err) {
    // fall through to config.url
  }
  return response && response.config ? response.config.url : undefined;
}

// URLs can contain tokens, proxy passwords and secret webhook paths. Never
// include the path/query of a failed write request in logs.
function redactUrl(raw, hidePath) {
  try {
    var parsed = new URL(raw);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    if (
      hidePath ||
      /\/bot[^/]+\//.test(parsed.pathname) ||
      /webhooks|\/services\//i.test(parsed.pathname)
    ) {
      parsed.pathname = "/[redacted]";
    }
    if (parsed.search) parsed.search = "?[redacted]";
    return parsed.toString();
  } catch (err) {
    return "[invalid or redacted URL]";
  }
}

function redactMessage(message) {
  return String(message).replace(/https?:\/\/[^\s"'<>]+/gi, function (value) {
    return redactUrl(value, true);
  });
}

// One-line, log-friendly summary of an axios failure (the raw error object
// dumps config, stack traces and byte buffers into the console).
function describeError(error) {
  if (!error) {
    return "unknown error";
  }
  var hidePath =
    error.config &&
    error.config.method &&
    !/^(get|head)$/i.test(error.config.method);
  if (error.response) {
    var status = error.response.status;
    var statusText = error.response.statusText || "";
    var url =
      (error.config && error.config.url) ||
      (error.response.config && error.response.config.url) ||
      "";
    return (
      "HTTP " +
      status +
      " " +
      statusText +
      " for " +
      (url ? redactUrl(url, hidePath) : "")
    ).trim();
  }
  if (error.request) {
    var reqUrl =
      error.config && error.config.url
        ? redactUrl(error.config.url, hidePath)
        : "";
    if (error.code === "ECONNABORTED" || /timeout/i.test(error.message || "")) {
      return "request timed out for " + reqUrl;
    }
    return (
      "request failed (" +
      (error.code || "no response") +
      ") for " +
      reqUrl
    ).trim();
  }
  return redactMessage(error.message || String(error));
}

module.exports.createClient = createClient;
module.exports.finalUrl = finalUrl;
module.exports.describeError = describeError;
module.exports.resolveProxy = resolveProxy;
module.exports.noProxyMatch = noProxyMatch;

module.exports.redactUrl = redactUrl;
