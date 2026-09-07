#!/usr/bin/env node
"use strict";

// Usage: node scrap-job-list.js [flags]
// Scrapes the paginated job list for a supported domain and prints it.
// Data goes to stdout; logs, warnings and errors go to stderr.

var fs = require("fs");
var constant = require("./utils/constant");
var sources = require("./utils/sources");
var args = require("./utils/args");
var csv = require("./utils/csv");
var http = require("./utils/http");
var crawl = require("./utils/crawl");
var logger = require("./utils/logger");
var runtime = require("./utils/runtime");
var validate = require("./utils/validate");

var HELP = [
  "Usage: node scrap-job-list.js [flags]",
  "",
  "Flags:",
  "  -d, --domain <domain>      Site to scrape. Allowed: " +
    constant.DOMAIN_LIST.join(", ") +
    " (default: " +
    constant.DEFAULT_DOMAIN +
    ")",
  "  -f, --format <format>      Output format: json, csv (default: " +
    constant.DEFAULT_FORMAT +
    ")",
  "  -o, --output <filename>    Write output to file (in addition to stdout).",
  "  --max-pages <n>            Follow at most n list pages (default: " +
    constant.MAX_PAGES +
    ").",
  "  --delay-ms <n>             Delay between page requests in ms (default: " +
    constant.REQUEST_DELAY_MS +
    ").",
  "  --timeout-ms <n>           Per-request timeout in ms (default: " +
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
  "  --allow-external           Follow off-site pagination links (default: same-site only).",
  "  --list-sources             List supported sources and exit.",
  "  --quiet                    Log errors only.",
  "  --verbose, -v              Debug logging.",
  "  -h, --help                 Show this help.",
  "",
  "Examples:",
  "  node scrap-job-list.js -d sarkariresult.com",
  "  node scrap-job-list.js -d sarkariexam.com -f csv -o jobs.csv",
];

function fail(message, exitCode) {
  console.error("Error: " + message);
  console.error("Run with --help for usage.");
  process.exit(exitCode || 2);
}

async function main() {
  if (process.argv.indexOf("--list-sources") !== -1) {
    console.log(sources.formatCatalog());
    process.exit(0);
  }
  var parsed = args.parseArgs(
    process.argv.slice(2),
    [
      {
        key: "domain",
        flags: ["-d", "--domain"],
        allowed: constant.DOMAIN_LIST,
        defaultValue: constant.DEFAULT_DOMAIN,
      },
      {
        key: "format",
        flags: ["-f", "--format"],
        allowed: constant.FORMAT_LIST,
        defaultValue: constant.DEFAULT_FORMAT,
      },
      { key: "filename", flags: ["-o", "--output"] },
      {
        key: "maxPages",
        flags: ["--max-pages"],
        defaultValue: constant.MAX_PAGES,
        parse: args.parseNonNegativeInt("max-pages"),
      },
      runtime.delayFlagSpec(),
    ].concat(runtime.networkFlagSpecs())
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
  var rt;
  try {
    rt = runtime.createRuntime(values);
  } catch (error) {
    fail(error.message);
  }
  log = rt.log;
  var crawlClient = runtime.createCrawlClient(rt, {
    domain: values.domain,
    allowExternal: values.allowExternal,
    ignoreRobots: values.ignoreRobots,
  });

  if (sources.statusOf(values.domain, "jobs") === "beta") {
    log.warn(
      '"' +
        values.domain +
        '" is a beta source: validate results against the live site ' +
        "(see docs/SOURCES.md)."
    );
  }

  var jobList = require("./scripts/" + values.domain + "/job-list");
  var allowed = await runtime.ensureRobotsAllowed(
    rt.robots,
    jobList.jobListUrl,
    {
      ignore: values.ignoreRobots,
      log: log,
    }
  );
  if (!allowed) {
    process.exit(1);
  }

  var result;
  try {
    result = await crawl.crawlJobList({
      scrapFn: jobList.scrapJobList,
      startUrl: jobList.jobListUrl,
      client: crawlClient,
      maxPages: values.maxPages,
      delayMs: values.delayMs,
      sameSiteDomain: values.allowExternal ? null : values.domain,
      log: function (message) {
        log.info(message);
      },
    });
  } catch (error) {
    log.error(http.describeError(error));
    process.exit(1);
  }

  var data = result.items;
  log.info(
    "done: " + data.length + " jobs across " + result.pages + " page(s)."
  );
  if (data.length === 0) {
    log.warn(
      "no jobs found. The site markup may have changed; " +
        "the selectors in scripts/" +
        values.domain +
        "/job-list.js may need updating."
    );
  }
  validate.checkJobList(data).forEach(function (warning) {
    log.warn(warning);
  });

  var output;
  try {
    if (values.format === "csv") {
      output = csv.parse(data);
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
        "job list written to " +
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
