"use strict";

// Shared CLI runtime: flag specs and wiring (logger, retrying HTTP client,
// robots.txt checker) used identically by all three entry points.

var constant = require("./constant");
var args = require("./args");
var http = require("./http");
var logger = require("./logger");
var retry = require("./retry");
var robots = require("./robots");

function networkFlagSpecs() {
  return [
    {
      key: "timeoutMs",
      flags: ["--timeout-ms"],
      defaultValue: constant.REQUEST_TIMEOUT_MS,
      parse: args.parseNonNegativeInt("timeout-ms"),
    },
    {
      key: "retries",
      flags: ["--retries"],
      defaultValue: constant.DEFAULT_RETRIES,
      parse: args.parseNonNegativeInt("retries"),
    },
    {
      key: "retryDelayMs",
      flags: ["--retry-delay-ms"],
      defaultValue: constant.RETRY_BASE_DELAY_MS,
      parse: args.parseNonNegativeInt("retry-delay-ms"),
    },
    {
      key: "proxyUrl",
      flags: ["--proxy"],
      defaultValue: null,
    },
    {
      key: "ignoreRobots",
      flags: ["--ignore-robots"],
      boolean: true,
      defaultValue: false,
    },
    {
      key: "allowExternal",
      flags: ["--allow-external"],
      boolean: true,
      defaultValue: false,
    },
    {
      key: "quiet",
      flags: ["--quiet"],
      boolean: true,
      defaultValue: false,
    },
    {
      key: "verbose",
      flags: ["--verbose", "-v"],
      boolean: true,
      defaultValue: false,
    },
  ];
}

function delayFlagSpec() {
  return {
    key: "delayMs",
    flags: ["--delay-ms"],
    defaultValue: constant.REQUEST_DELAY_MS,
    parse: args.parseNonNegativeInt("delay-ms"),
  };
}

function createRuntime(values) {
  var log = logger.createLogger({
    quiet: values.quiet,
    verbose: values.verbose,
  });
  // Throws on invalid proxy configuration (a usage error; callers exit 2).
  var client = http.createClient({
    timeoutMs: values.timeoutMs,
    proxyUrl: values.proxyUrl,
  });
  retry.addRetryInterceptor(client, {
    retries: values.retries,
    baseDelayMs: values.retryDelayMs,
    log: function (message) {
      log.debug(message);
    },
  });
  // Robots checks use a non-retrying client: robots.txt is best-effort and
  // must fail open fast.
  var robotsChecker = robots.createRobotsChecker({
    client: http.createClient({
      timeoutMs: values.timeoutMs,
      proxyUrl: values.proxyUrl,
    }),
    userAgent: constant.USER_AGENT,
  });
  if (client.__proxyVia) {
    log.info("using proxy " + client.__proxyVia);
  }
  return { log: log, client: client, robots: robotsChecker };
}

// Returns true when the crawl may proceed. Logs and returns false when
// robots.txt disallows the URL (unless explicitly ignored).
async function ensureRobotsAllowed(robotsChecker, url, options) {
  options = options || {};
  if (options.ignore) {
    return true;
  }
  var verdict = await robotsChecker.isAllowed(url);
  if (!options.log) {
    return verdict.allowed;
  }
  if (!verdict.allowed) {
    options.log.error(
      "blocked by robots.txt for " +
        url +
        " (" +
        verdict.reason +
        "). " +
        "Use --ignore-robots to override (only if permitted by the site)."
    );
    return false;
  }
  options.log.debug("robots.txt: " + verdict.reason + " for " + url);
  return true;
}

module.exports.networkFlagSpecs = networkFlagSpecs;
module.exports.delayFlagSpec = delayFlagSpec;
module.exports.createRuntime = createRuntime;
module.exports.ensureRobotsAllowed = ensureRobotsAllowed;

// Dedicated GET-only crawler wrapper. API/enrichment clients stay separate.
// Axios automatic redirects bypass robots checks, so follow them explicitly.
function createCrawlClient(rt, options) {
  options = options || {};
  var helper = require("./helper");
  return {
    get: async function (target) {
      var current = target;
      for (var hop = 0; hop <= 5; hop++) {
        if (!helper.isHttpUrl(current))
          throw new Error("Refusing non-HTTP crawl URL.");
        if (
          !options.allowExternal &&
          options.domain &&
          !helper.isSameSite(current, options.domain)
        ) {
          throw new Error("Refusing off-site crawl or redirect: " + current);
        }
        var allowed = await ensureRobotsAllowed(rt.robots, current, {
          ignore: options.ignoreRobots,
          log: rt.log,
        });
        if (!allowed) throw new Error("Blocked by robots.txt: " + current);
        var response = await rt.client.get(current, {
          maxRedirects: 0,
          validateStatus: function (status) {
            return (
              (status >= 200 && status < 300) ||
              [301, 302, 303, 307, 308].indexOf(status) !== -1
            );
          },
        });
        if ([301, 302, 303, 307, 308].indexOf(response.status) === -1)
          return response;
        var location = response.headers && response.headers.location;
        if (!location) throw new Error("Redirect has no Location header.");
        current = new URL(location, current).toString();
      }
      throw new Error("Too many crawl redirects.");
    },
  };
}

module.exports.createCrawlClient = createCrawlClient;
