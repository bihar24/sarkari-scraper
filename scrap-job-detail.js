#!/usr/bin/env node
"use strict";

// Usage: node scrap-job-detail.js -u <url> [flags]
// Scrapes a single job-detail page and prints the extracted records.
// Data goes to stdout; logs, warnings and errors go to stderr.

var fs = require("fs");
var constant = require("./utils/constant");
var sources = require("./utils/sources");
var args = require("./utils/args");
var csv = require("./utils/csv");
var helper = require("./utils/helper");
var http = require("./utils/http");
var logger = require("./utils/logger");
var runtime = require("./utils/runtime");
var validate = require("./utils/validate");

var HELP = [
  "Usage: node scrap-job-detail.js -u <url> [flags]",
  "",
  "Flags:",
  "  -u, --url <url>            Job detail page URL (required). The host must be one of: " +
    constant.DOMAIN_LIST.join(", "),
  "  -f, --format <format>      Output format: json, csv (default: " +
    constant.DEFAULT_FORMAT +
    ")",
  "  -o, --output <filename>    Write output to file (in addition to stdout).",
  "  --timeout-ms <n>           Request timeout in ms (default: " +
    constant.REQUEST_TIMEOUT_MS +
    ").",
  "  --retries <n>              Retries per request with backoff (default: " +
    constant.DEFAULT_RETRIES +
    ").",
  "  --retry-delay-ms <n>       Base retry delay in ms (default: " +
    constant.RETRY_BASE_DELAY_MS +
    ").",
  "  --proxy <url>              Proxy URL, e.g. http://user:pass@host:8080.",
  "  --ignore-robots            Skip the robots.txt check (default: respect it).",
  "  --allow-external           Allow off-site redirect targets (default: warn).",
  "  --list-sources             List supported sources and exit.",
  "  --quiet                    Log errors only.",
  "  --verbose, -v              Debug logging.",
  "  -h, --help                 Show this help.",
  "",
  "Example:",
  "  node scrap-job-detail.js -u https://www.sarkariresult.com/upsssc/01exam2018.php",
];

function fail(message, exitCode) {
  console.error("Error: " + message);
  console.error("Run with --help for usage.");
  process.exit(exitCode || 2);
}

function resolveDomain(rawUrl) {
  var parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    return { error: '"' + rawUrl + '" is not a valid URL.' };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "URL must use http(s): " + rawUrl };
  }
  var host = parsed.hostname.toLowerCase();
  if (host.startsWith("www.")) {
    host = host.slice(4);
  }
  if (constant.DOMAIN_LIST.indexOf(host) === -1) {
    return {
      error:
        'Domain "' +
        host +
        '" is not supported. Allowed: ' +
        constant.DOMAIN_LIST.join(", ") +
        ".",
    };
  }
  return { domain: host, url: parsed.toString() };
}

async function main() {
  if (process.argv.indexOf("--list-sources") !== -1) {
    console.log(sources.formatCatalog());
    process.exit(0);
  }
  var parsed = args.parseArgs(
    process.argv.slice(2),
    [{ key: "url", flags: ["-u", "--url"], required: true }]
      .concat([
        {
          key: "format",
          flags: ["-f", "--format"],
          allowed: constant.FORMAT_LIST,
          defaultValue: constant.DEFAULT_FORMAT,
        },
        { key: "filename", flags: ["-o", "--output"] },
      ])
      .concat(runtime.networkFlagSpecs())
  );

  if (parsed.helpRequested) {
    args.printHelp(HELP);
    process.exit(0);
  }
  var log = logger.createLogger({
    quiet: parsed.values.quiet,
    verbose: parsed.values.verbose,
  });
  parsed.warnings.forEach(function (warning) {
    log.warn(warning);
  });
  if (parsed.errors.length > 0) {
    fail(parsed.errors.join(" "));
  }

  var values = parsed.values;
  var resolved = resolveDomain(values.url);
  if (resolved.error) {
    fail(resolved.error);
  }

  var rt;
  try {
    rt = runtime.createRuntime(values);
  } catch (error) {
    fail(error.message);
  }
  log = rt.log;
  var crawlClient = runtime.createCrawlClient(rt, {
    domain: resolved.domain,
    allowExternal: values.allowExternal,
    ignoreRobots: values.ignoreRobots,
  });

  if (sources.statusOf(resolved.domain, "jobs") === "beta") {
    log.warn(
      '"' +
        resolved.domain +
        '" is a beta source: validate results against the live site ' +
        "(see docs/SOURCES.md)."
    );
  }

  var allowed = await runtime.ensureRobotsAllowed(rt.robots, resolved.url, {
    ignore: values.ignoreRobots,
    log: log,
  });
  if (!allowed) {
    process.exit(1);
  }

  var jobDetail = require("./scripts/" + resolved.domain + "/job-detail");

  var data;
  try {
    var response = await crawlClient.get(resolved.url);
    var pageUrl = http.finalUrl(response) || resolved.url;
    if (!values.allowExternal && !helper.isSameSite(pageUrl, resolved.domain)) {
      log.warn("page redirected off-site to " + pageUrl);
    }
    data = jobDetail.scrapJobDetail(response.data, pageUrl);
  } catch (error) {
    log.error(http.describeError(error));
    process.exit(1);
  }

  if (!Array.isArray(data) || data.length <= 1) {
    log.warn(
      "detail selectors matched nothing on this page (only the " +
        '"Post Link" record was produced). The markup in scripts/' +
        resolved.domain +
        "/job-detail.js may need updating."
    );
  } else {
    log.info("done: " + data.length + " record(s).");
  }
  validate.checkJobDetail(data).forEach(function (warning) {
    log.warn(warning);
  });

  var output;
  try {
    if (values.format === "csv") {
      output = csv.parse(csv.formatData(data));
    } else {
      output = JSON.stringify(data, null, 2);
    }
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }

  console.log(output);

  if (values.filename) {
    try {
      fs.writeFileSync(values.filename, output);
      log.info(
        resolved.url +
          " written to " +
          values.filename +
          " in " +
          values.format +
          " format."
      );
    } catch (error) {
      log.error("could not write to " + values.filename + ": " + error.message);
      process.exit(1);
    }
  }
}

main();
