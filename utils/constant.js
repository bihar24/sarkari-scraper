"use strict";

var sources = require("./sources");

// Domain lists are derived from the source registry (utils/sources.js) so
// there is exactly one place to register a new source.
const DOMAIN_LIST = sources.jobDomains();

const PAPER_DOMAIN_LIST = sources.paperDomains();

const FORMAT_LIST = ["json", "csv"];

const DEFAULT_DOMAIN = "sarkariresult.com";

const DEFAULT_PAPER_DOMAIN = "adda247.com";

const DEFAULT_FORMAT = "json";

// Polite-scraping / reliability defaults. All of these can be overridden
// per-run via CLI flags (see --help on each script).
const USER_AGENT =
  "sarkari-scraper/1.8 (+https://github.com/bihar24/sarkari-scraper)";
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_DELAY_MS = 1500;
const MAX_PAGES = 50;
const MAX_JOBS = 0; // 0 = no limit
const DEFAULT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const DEFAULT_CONCURRENCY = 1;
const MAX_CONCURRENCY = 10;

module.exports.DOMAIN_LIST = DOMAIN_LIST;
module.exports.PAPER_DOMAIN_LIST = PAPER_DOMAIN_LIST;
module.exports.FORMAT_LIST = FORMAT_LIST;
module.exports.DEFAULT_DOMAIN = DEFAULT_DOMAIN;
module.exports.DEFAULT_PAPER_DOMAIN = DEFAULT_PAPER_DOMAIN;
module.exports.DEFAULT_FORMAT = DEFAULT_FORMAT;
module.exports.USER_AGENT = USER_AGENT;
module.exports.REQUEST_TIMEOUT_MS = REQUEST_TIMEOUT_MS;
module.exports.REQUEST_DELAY_MS = REQUEST_DELAY_MS;
module.exports.MAX_PAGES = MAX_PAGES;
module.exports.MAX_JOBS = MAX_JOBS;
module.exports.DEFAULT_RETRIES = DEFAULT_RETRIES;
module.exports.RETRY_BASE_DELAY_MS = RETRY_BASE_DELAY_MS;
module.exports.DEFAULT_CONCURRENCY = DEFAULT_CONCURRENCY;
module.exports.MAX_CONCURRENCY = MAX_CONCURRENCY;
