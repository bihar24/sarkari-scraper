"use strict";

// Retry with exponential backoff + jitter, honouring Retry-After.
// Wired into axios as a response interceptor so every request made through
// the client (list pages, detail pages) is covered automatically.

var helper = require("./helper");
var http = require("./http");

var MAX_WAIT_MS = 30000;
var MAX_RETRY_AFTER_MS = 60000;

var RETRYABLE_CODES = [
  "ECONNABORTED", // axios timeout
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
];

function statusOf(error) {
  return error && error.response ? error.response.status : null;
}

function isRetryable(error) {
  if (!error || error.code === "ERR_CANCELED") {
    return false;
  }
  var status = statusOf(error);
  if (status !== null) {
    return status === 429 || status >= 500;
  }
  // No response received: retry transient network faults only.
  return RETRYABLE_CODES.indexOf(error.code) !== -1;
}

function retryAfterMs(error) {
  try {
    var headers = error && error.response ? error.response.headers : null;
    if (!headers) {
      return 0;
    }
    var raw = headers["retry-after"];
    if (raw === undefined || raw === null || raw === "") {
      return 0;
    }
    var seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
    var when = Date.parse(raw);
    if (!Number.isNaN(when)) {
      return Math.max(0, Math.min(when - Date.now(), MAX_RETRY_AFTER_MS));
    }
  } catch (err) {
    // fall through to 0
  }
  return 0;
}

function computeDelay(attempt, baseDelayMs) {
  // attempt is 0-based: 1s, 2s, 4s, ... plus full jitter, capped.
  var backoff = baseDelayMs * Math.pow(2, attempt);
  var jitter = Math.random() * baseDelayMs;
  return Math.min(Math.floor(backoff + jitter), MAX_WAIT_MS);
}

function addRetryInterceptor(client, options) {
  options = options || {};
  var retries = options.retries === undefined ? 3 : options.retries;
  var baseDelayMs =
    options.baseDelayMs === undefined ? 1000 : options.baseDelayMs;
  var log =
    options.log ||
    function () {
      // silent by default
    };

  client.interceptors.response.use(undefined, function onError(error) {
    var config = error ? error.config : null;
    if (!config || !isRetryable(error)) {
      return Promise.reject(error);
    }
    config.__retryCount = config.__retryCount || 0;
    if (config.__retryCount >= retries) {
      return Promise.reject(error);
    }
    config.__retryCount += 1;
    var wait = Math.max(
      computeDelay(config.__retryCount - 1, baseDelayMs),
      retryAfterMs(error)
    );
    log(
      "request failed (" +
        http.describeError(error) +
        "); retry " +
        config.__retryCount +
        "/" +
        retries +
        " in " +
        wait +
        "ms"
    );
    return helper.sleep(wait).then(function () {
      return client.request(config);
    });
  });

  return client;
}

module.exports.addRetryInterceptor = addRetryInterceptor;
module.exports.isRetryable = isRetryable;
module.exports.retryAfterMs = retryAfterMs;
module.exports.computeDelay = computeDelay;
