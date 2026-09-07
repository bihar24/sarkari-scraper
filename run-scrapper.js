#!/usr/bin/env node
"use strict";

// Usage: node run-scrapper.js -o <file> [flags]
// Crawls a domain's job list (following pagination), scrapes every job
// detail page, and writes ONE valid output file. Logs, warnings and errors
// go to stderr; a short summary is printed on completion.

var fs = require("fs");
var constant = require("./utils/constant");
var args = require("./utils/args");
var csv = require("./utils/csv");
var helper = require("./utils/helper");
var http = require("./utils/http");
var crawl = require("./utils/crawl");
var logger = require("./utils/logger");
var pool = require("./utils/pool");
var runtime = require("./utils/runtime");
var validate = require("./utils/validate");

var HELP = [
  "Usage: node run-scrapper.js -o <file> [flags]",
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
  "  -o, --output <filename>    Output file (required). Overwritten on each run.",
  "  --max-pages <n>            Follow at most n list pages (default: " +
    constant.MAX_PAGES +
    ").",
  "  --max-jobs <n>             Scrape at most n jobs; 0 = no limit (default: " +
    constant.MAX_JOBS +
    ").",
  "  --concurrency <n>          Parallel detail requests, 1-" +
    constant.MAX_CONCURRENCY +
    " (default: " +
    constant.DEFAULT_CONCURRENCY +
    ").",
  "  --delay-ms <n>             Delay between requests in ms (default: " +
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
  "  --allow-external           Scrape off-site job links (default: same-site only).",
  "  --quiet                    Log errors only.",
  "  --verbose, -v              Debug logging.",
  "  -h, --help                 Show this help.",
  "",
  "Output shapes:",
  "  json: [ { url, detail: [records...] }, ... ]  (failed pages: { url, detail: null, error })",
  "  csv:  one row per record with a sourceUrl column (failed pages: one row with an error column)",
  "",
  "Example:",
  "  node run-scrapper.js -d freshersnow.com -f csv -o output.csv",
];

function fail(message, exitCode) {
  console.error("Error: " + message);
  console.error("Run with --help for usage.");
  process.exit(exitCode || 2);
}

function toCsvRows(jobs) {
  var rows = [];
  jobs.forEach(function (job) {
    if (job.error) {
      rows.push({ sourceUrl: job.url, error: job.error });
      return;
    }
    var records = csv.formatData(job.detail);
    if (records.length === 0) {
      rows.push({ sourceUrl: job.url });
      return;
    }
    records.forEach(function (record) {
      rows.push(Object.assign({ sourceUrl: job.url }, record));
    });
  });
  return rows;
}

function clampConcurrency(value, log) {
  if (value < 1) {
    log.warn("concurrency must be >= 1; using 1.");
    return 1;
  }
  if (value > constant.MAX_CONCURRENCY) {
    log.warn(
      "concurrency clamped to " +
        constant.MAX_CONCURRENCY +
        " (politeness cap)."
    );
    return constant.MAX_CONCURRENCY;
  }
  return value;
}

async function main() {
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
      { key: "filename", flags: ["-o", "--output"], required: true },
      {
        key: "maxPages",
        flags: ["--max-pages"],
        defaultValue: constant.MAX_PAGES,
        parse: args.parseNonNegativeInt("max-pages"),
      },
      {
        key: "maxJobs",
        flags: ["--max-jobs"],
        defaultValue: constant.MAX_JOBS,
        parse: args.parseNonNegativeInt("max-jobs"),
      },
      {
        key: "concurrency",
        flags: ["--concurrency"],
        defaultValue: constant.DEFAULT_CONCURRENCY,
        parse: args.parseNonNegativeInt("concurrency"),
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
  var concurrency = clampConcurrency(values.concurrency, log);

  var jobList = require("./scripts/" + values.domain + "/job-list");
  var jobDetail = require("./scripts/" + values.domain + "/job-detail");

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

  // Phase 1: crawl the (possibly paginated) job list.
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

  if (result.blocked && result.items.length === 0) {
    log.error(
      "Blocked/error page detected while crawling " +
        values.domain +
        "; keeping the previous output file unchanged."
    );
    process.exit(1);
  }

  var links = [];
  var skipped = 0;
  result.items.forEach(function (item) {
    var link = item && item.link;
    if (!helper.isHttpUrl(link)) {
      skipped += 1;
      return;
    }
    if (!values.allowExternal && !helper.isSameSite(link, values.domain)) {
      skipped += 1;
      log.debug("skipping off-site job link: " + link);
      return;
    }
    links.push(link);
  });
  log.info(
    "list done: " +
      result.items.length +
      " jobs across " +
      result.pages +
      " page(s)."
  );
  if (skipped > 0) {
    log.info("skipped " + skipped + " job(s) with missing/off-site links.");
  }
  if (result.items.length === 0) {
    log.warn(
      "no jobs found. The site markup may have changed; " +
        "the selectors in scripts/" +
        values.domain +
        "/job-list.js may need updating."
    );
  }
  validate.checkJobList(result.items).forEach(function (warning) {
    log.warn(warning);
  });
  if (values.maxJobs > 0 && links.length > values.maxJobs) {
    links = links.slice(0, values.maxJobs);
    log.info("limited to first " + values.maxJobs + " job(s) (--max-jobs).");
  }

  if (links.length === 0) {
    log.error(
      "No usable job links; keeping the previous output file unchanged."
    );
    process.exit(1);
  }

  // Phase 2: scrape each job detail page (bounded concurrency, polite delay).
  var completed = 0;
  var results = await pool.runPool(
    links,
    async function (url) {
      var response = await crawlClient.get(url);
      var pageUrl = http.finalUrl(response) || url;
      if (!values.allowExternal && !helper.isSameSite(pageUrl, values.domain)) {
        log.warn("page redirected off-site: " + pageUrl);
      }
      var detail = jobDetail.scrapJobDetail(response.data, pageUrl);
      if (!Array.isArray(detail) || detail.length <= 1) {
        throw new Error(
          "Detail parser matched no content; review source markup."
        );
      }
      validate.checkJobDetail(detail).forEach(function (warning) {
        log.debug(pageUrl + ": " + warning);
      });
      completed += 1;
      log.info("[" + completed + "/" + links.length + "] scraped " + pageUrl);
      return { url: pageUrl, detail: detail };
    },
    { concurrency: concurrency, delayMs: values.delayMs }
  );

  var jobs = [];
  var failed = 0;
  results.forEach(function (entry, index) {
    if (entry.ok) {
      jobs.push(entry.value);
    } else {
      failed += 1;
      var message = http.describeError(entry.error);
      jobs.push({ url: links[index], detail: null, error: message });
      log.warn("FAILED " + links[index] + ": " + message);
    }
  });

  // Phase 3: write one valid output file.
  var output;
  try {
    if (values.format === "csv") {
      output = csv.parse(toCsvRows(jobs));
    } else {
      output = JSON.stringify(jobs, null, 2);
    }
  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }

  try {
    fs.writeFileSync(values.filename, output);
  } catch (error) {
    log.error("could not write to " + values.filename + ": " + error.message);
    process.exit(1);
  }

  log.info(
    "done: " +
      jobs.length +
      " job(s) (" +
      (jobs.length - failed) +
      " ok, " +
      failed +
      " failed) written to " +
      values.filename +
      " in " +
      values.format +
      " format."
  );
  if (failed > 0) {
    process.exit(1);
  }
}

main();
