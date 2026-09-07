#!/usr/bin/env node
"use strict";

// Usage: node job-digest.js [-i <jobs.json>] [--rss-input <feed-url,...>] [flags]
// Turns run-scrapper JSON output into an enriched alert digest: AI summaries,
// translations, pincode locations, holiday-aware deadlines, archive links,
// RSS/ICS feeds, Telegram/Discord/webhook alerts and one-click publishing.
// State goes to stderr; --dry-run prints alert payloads to stdout.

var fs = require("fs");
var path = require("path");
var constant = require("./utils/constant");
var args = require("./utils/args");
var calendar = require("./utils/calendar");
var digest = require("./utils/digest");
var enrich = require("./utils/enrich");
var feedInput = require("./utils/feed");
var http = require("./utils/http");
var logger = require("./utils/logger");
var notify = require("./utils/notify");
var notifydb = require("./utils/notifydb");
var pool = require("./utils/pool");
var rss = require("./utils/rss");
var runtime = require("./utils/runtime");

var ALERT_TARGETS = ["telegram", "discord", "webhook"];
var MAX_PINS_PER_JOB = 3;
var MAX_ALERT_FAILURES = 3;

var HELP = [
  "Usage: node job-digest.js [-i <jobs.json>] [--rss-input <feed-url,...>] [flags]",
  "",
  "Flags:",
  "  -i, --input <file>         run-scrapper JSON output (required unless --rss-input).",
  "  --rss-input <urls>         Comma-separated RSS/Atom feed URL(s) to digest",
  "                             (any job-portal feed; robots.txt respected).",
  "  --state <file>             State file for new-job diffing + enrichment cache",
  "                             (default: <input>.state.json). First run only",
  "                             initialises state; alerts start on the next run.",
  "  --alert <list>             Comma-separated: telegram,discord,webhook.",
  "  --all                      Alert on every job, not just new ones.",
  "  --dry-run                  Print alert payloads to stdout, send nothing.",
  "  --summarize                AI 2-line summary per job (Pollinations, keyless).",
  "  --translate <lang>         Translate titles, e.g. hi (MyMemory, keyless).",
  "  --locate                   Pincode -> district/state via api.postalpincode.in.",
  "  --holidays                 Flag deadlines on Indian public holidays (Nager.Date).",
  "  --archive                  Wayback Machine snapshot link per job.",
  "  --shorten                  Short alert links via CleanURI.",
  "  --rss <file>               Write an RSS 2.0 feed of all jobs.",
  "  --ics <file>               Write an iCalendar file of parsed deadlines.",
  "  --out <file>               Write enriched digest JSON.",
  "  --upload                   Publish --out to Catbox (keyless) and print the URL.",
  "  --db <file>                Archive notified jobs in SQLite; Bloom pre-filter",
  "                             skips already-notified jobs even if state was lost.",
  "  --concurrency <n>          Parallel enrichment requests, 1-" +
    constant.MAX_CONCURRENCY +
    " (default: 2).",
  "  --delay-ms <n>             Delay between enrichment requests in ms (default: " +
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
  "  --quiet                    Log errors only.",
  "  --verbose, -v              Debug logging.",
  "  -h, --help                 Show this help.",
  "",
  "Credentials (environment variables, never flags):",
  "  telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID",
  "  discord:  DISCORD_WEBHOOK_URL",
  "  webhook:  WEBHOOK_URL (generic JSON POST; Slack-compatible {text, jobs})",
  "  translate quota: TRANSLATE_EMAIL (raises MyMemory to 50k chars/day)",
  "",
  "Examples:",
  "  node run-scrapper.js -d sarkariresult.com -f json -o jobs.json",
  "  node job-digest.js -i jobs.json --alert telegram --summarize --translate hi --rss feed.xml",
  "  node job-digest.js --rss-input https://portal.example/feed --alert discord --dry-run",
];

function fail(message, exitCode) {
  console.error("Error: " + message);
  console.error("Run with --help for usage.");
  process.exit(exitCode || 2);
}

function parseAlertList(raw) {
  if (!raw) {
    return [];
  }
  var targets = raw
    .split(",")
    .map(function (entry) {
      return entry.trim().toLowerCase();
    })
    .filter(function (entry) {
      return entry !== "";
    });
  var bad = targets.filter(function (entry) {
    return ALERT_TARGETS.indexOf(entry) === -1;
  });
  if (bad.length > 0) {
    fail(
      'Unknown alert target(s): "' +
        bad.join(", ") +
        '". Allowed: ' +
        ALERT_TARGETS.join(", ") +
        "."
    );
  }
  return targets;
}

function clampConcurrency(value, log) {
  if (value < 1) {
    log.warn("concurrency must be >= 1; using 1.");
    return 1;
  }
  if (value > constant.MAX_CONCURRENCY) {
    log.warn("concurrency clamped to " + constant.MAX_CONCURRENCY + ".");
    return constant.MAX_CONCURRENCY;
  }
  return value;
}

function excerpt(text, max) {
  var out = String(text || "")
    .trim()
    .replace(/\s+/g, " ");
  if (out.length <= max) {
    return out;
  }
  return out.slice(0, max - 1).trim() + "…";
}

async function main() {
  var networkSpecs = runtime.networkFlagSpecs().filter(function (spec) {
    return (
      [
        "timeoutMs",
        "retries",
        "retryDelayMs",
        "proxyUrl",
        "quiet",
        "verbose",
      ].indexOf(spec.key) !== -1
    );
  });
  var parsed = args.parseArgs(
    process.argv.slice(2),
    [
      { key: "input", flags: ["-i", "--input"] },
      { key: "rssInput", flags: ["--rss-input"] },
      { key: "state", flags: ["--state"] },
      { key: "alert", flags: ["--alert"] },
      { key: "all", flags: ["--all"], boolean: true, defaultValue: false },
      {
        key: "dryRun",
        flags: ["--dry-run"],
        boolean: true,
        defaultValue: false,
      },
      {
        key: "summarize",
        flags: ["--summarize"],
        boolean: true,
        defaultValue: false,
      },
      { key: "translate", flags: ["--translate"] },
      {
        key: "locate",
        flags: ["--locate"],
        boolean: true,
        defaultValue: false,
      },
      {
        key: "holidays",
        flags: ["--holidays"],
        boolean: true,
        defaultValue: false,
      },
      {
        key: "archive",
        flags: ["--archive"],
        boolean: true,
        defaultValue: false,
      },
      {
        key: "shorten",
        flags: ["--shorten"],
        boolean: true,
        defaultValue: false,
      },
      { key: "rss", flags: ["--rss"] },
      { key: "ics", flags: ["--ics"] },
      { key: "out", flags: ["--out"] },
      {
        key: "upload",
        flags: ["--upload"],
        boolean: true,
        defaultValue: false,
      },
      { key: "db", flags: ["--db"] },
      {
        key: "concurrency",
        flags: ["--concurrency"],
        defaultValue: 2,
        parse: args.parseNonNegativeInt("concurrency"),
      },
      runtime.delayFlagSpec(),
    ].concat(networkSpecs)
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
  if (
    values.translate !== undefined &&
    values.translate !== null &&
    !/^[a-z]{2}(-[a-zA-Z]{2,})?$/.test(values.translate)
  ) {
    fail('Invalid language "' + values.translate + '". Use a code like "hi".');
  }
  var targets = parseAlertList(values.alert);
  if (!values.input && !values.rssInput) {
    fail("need -i <file> and/or --rss-input <feed-url,...>.");
  }
  var statePath =
    values.state ||
    (values.input ? values.input + ".state.json" : "digest.state.json");

  var rt;
  try {
    rt = runtime.createRuntime(values);
  } catch (error) {
    fail(error.message);
  }
  log = rt.log;
  var concurrency = clampConcurrency(values.concurrency, log);

  var jobs = [];
  if (values.input) {
    try {
      jobs = digest.loadJobsFile(values.input);
    } catch (error) {
      fail(error.message);
    }
  }

  var feedUrls = (values.rssInput || "")
    .split(",")
    .map(function (entry) {
      return entry.trim();
    })
    .filter(function (entry) {
      return entry !== "";
    });
  var feedJobs = 0;
  for (var f = 0; f < feedUrls.length; f++) {
    var feedParsed;
    try {
      feedParsed = new URL(feedUrls[f]);
    } catch (err) {
      fail('"' + feedUrls[f] + '" is not a valid feed URL.');
    }
    if (feedParsed.protocol !== "http:" && feedParsed.protocol !== "https:") {
      fail("feed URL must use http(s): " + feedUrls[f]);
    }
    var feedUrl = feedParsed.toString();
    var feedAllowed = await runtime.ensureRobotsAllowed(rt.robots, feedUrl, {
      ignore: false,
      log: log,
    });
    if (!feedAllowed) {
      log.warn("skipping feed disallowed by robots.txt: " + feedUrl);
      continue;
    }
    try {
      var fetched = await feedInput.fetchFeed(rt.client, feedUrl);
      feedJobs += fetched.jobs.length;
      jobs.push.apply(jobs, fetched.jobs);
      log.info(feedUrl + ": " + fetched.jobs.length + " item(s).");
      if (fetched.skipped > 0) {
        log.warn(
          feedUrl + ": skipped " + fetched.skipped + " item(s) without links."
        );
      }
      if (fetched.jobs.length === 0) {
        log.warn(feedUrl + ": no usable items found.");
      }
    } catch (error) {
      log.warn("skipping feed " + feedUrl + ": " + http.describeError(error));
    }
  }
  var seenUrls = {};
  jobs = jobs.filter(function (job) {
    if (!job || !job.url || seenUrls[job.url]) {
      return false;
    }
    seenUrls[job.url] = true;
    return true;
  });

  var loaded = digest.loadState(statePath);
  var state = loaded.state;
  var diffed = digest.diffJobs(jobs, state);
  var freshUrls = {};
  diffed.fresh.forEach(function (job) {
    freshUrls[job.url] = true;
  });
  log.info(
    "loaded " +
      jobs.length +
      " job(s)" +
      (feedUrls.length > 0
        ? " (" + feedJobs + " from " + feedUrls.length + " feed(s))"
        : "") +
      ", " +
      diffed.fresh.length +
      " new since last run."
  );

  // --- Enrich every job (cache makes repeat runs nearly free) ---

  function cachedOrNull(key) {
    var hit = digest.cacheGet(state, key);
    return hit === undefined ? undefined : hit;
  }

  async function enrichJob(job) {
    var title = digest.extractTitle(job);
    var text = digest.extractText(job);
    var deadline = digest.extractDeadline(job);
    var enriched = {
      url: job.url,
      title: title,
      titleAlt: null,
      summary: null,
      deadline: deadline,
      weekend: Boolean(
        deadline && deadline.parsed && calendar.isWeekend(deadline.parsed)
      ),
      holiday: null,
      location: null,
      link: job.url,
      archiveUrl: null,
      calLink: null,
    };

    var tasks = [];
    if (values.summarize && text) {
      var sumKey = "sum:" + digest.hash(text);
      tasks.push(
        (async function () {
          var hit = cachedOrNull(sumKey);
          if (hit === undefined) {
            hit = await enrich.summarizeJob(rt.client, text, {
              log: function (message) {
                log.debug(message);
              },
            });
            digest.cacheSet(state, sumKey, hit);
          }
          enriched.summary = hit;
        })()
      );
    }
    if (values.translate) {
      var transKey =
        "t:" + values.translate.toLowerCase() + ":" + digest.hash(title);
      tasks.push(
        (async function () {
          var hit = cachedOrNull(transKey);
          if (hit === undefined) {
            hit = await enrich.translateText(
              rt.client,
              title,
              values.translate,
              {
                email: process.env.TRANSLATE_EMAIL || null,
                log: function (message) {
                  log.debug(message);
                },
              }
            );
            digest.cacheSet(state, transKey, hit);
          }
          enriched.titleAlt = hit;
        })()
      );
    }
    if (values.locate) {
      var pins = digest
        .extractPincodes(text + "\n" + title)
        .slice(0, MAX_PINS_PER_JOB);
      pins.forEach(function (pin) {
        var pinKey = "pin:" + pin;
        tasks.push(
          (async function () {
            var hit = cachedOrNull(pinKey);
            if (hit === undefined) {
              hit = await enrich.lookupPincode(rt.client, pin, {
                log: function (message) {
                  log.debug(message);
                },
              });
              digest.cacheSet(state, pinKey, hit);
            }
            return hit;
          })()
        );
      });
    }
    if (values.archive) {
      var archKey = "arch:" + job.url;
      tasks.push(
        (async function () {
          var hit = cachedOrNull(archKey);
          if (hit === undefined) {
            hit = await enrich.archivePage(rt.client, job.url, {
              log: function (message) {
                log.debug(message);
              },
            });
            digest.cacheSet(state, archKey, hit);
          }
          enriched.archiveUrl = hit;
        })()
      );
    }
    if (values.shorten) {
      var shortKey = "short:" + job.url;
      tasks.push(
        (async function () {
          var hit = cachedOrNull(shortKey);
          if (hit === undefined) {
            hit = await enrich.shortenUrl(rt.client, job.url, {
              log: function (message) {
                log.debug(message);
              },
            });
            digest.cacheSet(state, shortKey, hit);
          }
          if (hit) {
            enriched.link = hit;
          }
        })()
      );
    }
    await Promise.all(tasks);

    if (values.locate) {
      var pinsDone = digest
        .extractPincodes(text + "\n" + title)
        .slice(0, MAX_PINS_PER_JOB);
      var places = [];
      pinsDone.forEach(function (pin) {
        var hit = digest.cacheGet(state, "pin:" + pin);
        if (hit && (hit.district || hit.state)) {
          places.push(
            [hit.district, hit.state].filter(Boolean).join(", ") + " 📮" + pin
          );
        }
      });
      if (places.length > 0) {
        enriched.location = places.slice(0, 2).join(" · ");
      }
    }
    if (deadline && deadline.parsed) {
      enriched.calLink = calendar.googleCalLink({
        title: title + " — last date",
        date: deadline.parsed,
        details: enriched.link,
      });
    }
    if (!enriched.summary) {
      enriched.summary = excerpt(text, 300) || null;
    }
    return enriched;
  }

  function needsNetwork(job) {
    var title = digest.extractTitle(job);
    var text = digest.extractText(job);
    if (
      values.summarize &&
      text &&
      cachedOrNull("sum:" + digest.hash(text)) === undefined
    ) {
      return true;
    }
    if (
      values.translate &&
      cachedOrNull(
        "t:" + values.translate.toLowerCase() + ":" + digest.hash(title)
      ) === undefined
    ) {
      return true;
    }
    if (values.locate) {
      var pins = digest
        .extractPincodes(text + "\n" + title)
        .slice(0, MAX_PINS_PER_JOB);
      for (var i = 0; i < pins.length; i++) {
        if (cachedOrNull("pin:" + pins[i]) === undefined) {
          return true;
        }
      }
    }
    if (values.archive && cachedOrNull("arch:" + job.url) === undefined) {
      return true;
    }
    if (values.shorten && cachedOrNull("short:" + job.url) === undefined) {
      return true;
    }
    return false;
  }

  var enrichedByUrl = {};
  var todo = jobs.filter(needsNetwork);
  var instant = jobs.filter(function (job) {
    return !needsNetwork(job);
  });
  log.debug(
    todo.length +
      " job(s) need live enrichment, " +
      instant.length +
      " served from cache."
  );
  for (var s = 0; s < instant.length; s++) {
    var ready = await enrichJob(instant[s]);
    enrichedByUrl[ready.url] = ready;
  }
  if (todo.length > 0) {
    var worked = await pool.runPool(
      todo,
      function (job) {
        return enrichJob(job);
      },
      { concurrency: concurrency, delayMs: values.delayMs }
    );
    worked.forEach(function (entry) {
      if (entry.ok) {
        enrichedByUrl[entry.value.url] = entry.value;
      }
    });
  }
  var enrichedJobs = jobs.map(function (job) {
    return enrichedByUrl[job.url];
  });

  // --- Holiday-aware deadlines (one cached fetch per year) ---

  if (values.holidays) {
    var years = {};
    enrichedJobs.forEach(function (item) {
      if (item.deadline && item.deadline.parsed) {
        years[item.deadline.parsed.getUTCFullYear()] = true;
      }
    });
    var byDate = {};
    var yearList = Object.keys(years);
    for (var y = 0; y < yearList.length; y++) {
      var holKey = "hol:IN:" + yearList[y];
      var hit = cachedOrNull(holKey);
      if (hit === undefined) {
        hit = await enrich.fetchHolidays(rt.client, yearList[y], "IN", {
          log: function (message) {
            log.debug(message);
          },
        });
        digest.cacheSet(state, holKey, hit);
      }
      (hit || []).forEach(function (entry) {
        byDate[entry.date] = entry.name || entry.localName;
      });
    }
    enrichedJobs.forEach(function (item) {
      if (item.deadline && item.deadline.parsed) {
        var iso = item.deadline.parsed.toISOString().slice(0, 10);
        if (byDate[iso]) {
          item.holiday = byDate[iso];
        }
      }
    });
  }

  function alertItem(item) {
    return {
      title: item.title,
      titleAlt: item.titleAlt,
      url: item.url,
      link: item.link,
      summary: item.summary,
      deadline: item.deadline
        ? { raw: item.deadline.raw, holiday: item.holiday }
        : null,
      weekend: item.weekend,
      location: item.location,
      archiveUrl: item.archiveUrl,
      calLink: item.calLink,
    };
  }

  // --- File outputs (cover ALL jobs) ---

  var outPath = values.out || null;
  if (values.upload && !outPath) {
    outPath = values.input
      ? values.input.replace(/\.json$/i, "") + ".digest.json"
      : "digest.digest.json";
  }
  if (outPath) {
    var payload = enrichedJobs.map(function (item) {
      return {
        url: item.url,
        title: item.title,
        titleAlt: item.titleAlt,
        summary: item.summary,
        deadline: item.deadline ? item.deadline.raw : null,
        deadlineDate:
          item.deadline && item.deadline.parsed
            ? item.deadline.parsed.toISOString().slice(0, 10)
            : null,
        holiday: item.holiday,
        weekend: item.weekend,
        location: item.location,
        link: item.link,
        archiveUrl: item.archiveUrl,
        calLink: item.calLink,
      };
    });
    try {
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
      log.info("enriched digest written to " + outPath);
    } catch (error) {
      log.error("could not write to " + outPath + ": " + error.message);
      process.exit(1);
    }
  }

  if (values.upload) {
    var publicUrl = await enrich.uploadFile(rt.client, outPath, {
      filename: path.basename(outPath),
      log: function (message) {
        log.debug(message);
      },
    });
    if (publicUrl) {
      log.info("published digest: " + publicUrl);
    } else {
      log.warn("upload failed; continuing with local outputs.");
    }
  }

  if (values.rss) {
    var feed = rss.buildRss({
      title: "Sarkari job digest",
      link: jobs.length > 0 ? jobs[0].url : "",
      description: "Latest government job postings",
      builtAt: new Date(),
      items: enrichedJobs.map(function (item) {
        var stamp = state.jobs[item.url] && state.jobs[item.url].firstSeen;
        return {
          title: item.title,
          link: item.url,
          guid: item.url,
          description:
            (item.summary || "") +
            (item.deadline ? "\nLast date: " + item.deadline.raw : ""),
          pubDate: stamp ? new Date(stamp) : new Date(),
        };
      }),
    });
    try {
      fs.writeFileSync(values.rss, feed);
      log.info("RSS feed written to " + values.rss);
    } catch (error) {
      log.error("could not write to " + values.rss + ": " + error.message);
      process.exit(1);
    }
  }

  if (values.ics) {
    var events = [];
    enrichedJobs.forEach(function (item, index) {
      if (item.deadline && item.deadline.parsed) {
        var description = item.link;
        if (item.holiday) {
          description +=
            " (" + item.holiday + " — public holiday, apply early!)";
        } else if (item.weekend) {
          description += " (falls on a weekend, apply early!)";
        }
        events.push({
          uid: "sarkari-" + digest.hash(item.url) + "-" + index,
          title: item.title + " — last date",
          date: item.deadline.parsed,
          description: description,
          url: item.url,
        });
      }
    });
    try {
      fs.writeFileSync(values.ics, calendar.buildIcs(events));
      log.info(
        "calendar written to " +
          values.ics +
          " (" +
          events.length +
          " deadline(s))."
      );
    } catch (error) {
      log.error("could not write to " + values.ics + ": " + error.message);
      process.exit(1);
    }
  }

  // --- Alerts (fresh jobs only, unless --all) ---

  var notifyDb = null;
  if (values.db && !values.dryRun) {
    try {
      notifyDb = await notifydb.openNotifyDb(values.db);
    } catch (error) {
      fail(error.message);
    }
  }

  var alertJobs = values.all
    ? enrichedJobs
    : enrichedJobs.filter(function (item) {
        return freshUrls[item.url];
      });
  if (notifyDb && !values.all) {
    var before = alertJobs.length;
    alertJobs = alertJobs.filter(function (item) {
      return !notifyDb.notified(item.url);
    });
    if (alertJobs.length < before) {
      log.info(
        "db backstop skipped " +
          (before - alertJobs.length) +
          " already-notified job(s)."
      );
    }
  }
  var quarantined = 0;
  alertJobs = alertJobs.filter(function (item) {
    if ((state.quarantine[item.url] || 0) >= MAX_ALERT_FAILURES) {
      quarantined += 1;
      return false;
    }
    return true;
  });
  if (quarantined > 0) {
    log.warn(
      quarantined +
        " job(s) quarantined after repeated alert failures " +
        "(fix the transport, or delete state to force a retry)."
    );
  }

  var failures = [];
  if (targets.length === 0) {
    log.info("no --alert targets; outputs only.");
  } else if (loaded.fresh && !values.all) {
    log.info(
      "state initialised with " +
        jobs.length +
        " job(s); alerts start on the next run (or re-run with --all)."
    );
  } else if (alertJobs.length === 0) {
    log.info("no new jobs; nothing to alert.");
  } else {
    var items = alertJobs.map(alertItem);

    if (values.dryRun) {
      if (targets.indexOf("telegram") !== -1) {
        console.log(notify.packTelegram(items).join("\n\n====\n\n"));
      }
      if (targets.indexOf("discord") !== -1) {
        console.log(
          JSON.stringify(items.map(notify.formatDiscordEmbed), null, 2)
        );
      }
      if (targets.indexOf("webhook") !== -1) {
        console.log(JSON.stringify(notify.webhookPayload(items), null, 2));
      }
    } else {
      if (targets.indexOf("telegram") !== -1) {
        if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
          failures.push(
            "telegram: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID."
          );
        } else {
          try {
            var sent = await notify.sendTelegram(rt.client, {
              token: process.env.TELEGRAM_BOT_TOKEN,
              chatId: process.env.TELEGRAM_CHAT_ID,
              texts: notify.packTelegram(items),
            });
            log.info("telegram: sent " + sent.sent + " message(s).");
          } catch (error) {
            failures.push("telegram: " + http.describeError(error));
          }
        }
      }
      if (targets.indexOf("discord") !== -1) {
        if (!process.env.DISCORD_WEBHOOK_URL) {
          failures.push("discord: set DISCORD_WEBHOOK_URL.");
        } else {
          try {
            var posted = await notify.sendDiscord(rt.client, {
              webhookUrl: process.env.DISCORD_WEBHOOK_URL,
              embeds: items.map(notify.formatDiscordEmbed),
            });
            log.info("discord: sent " + posted.sent + " embed(s).");
          } catch (error) {
            failures.push("discord: " + http.describeError(error));
          }
        }
      }
      if (targets.indexOf("webhook") !== -1) {
        if (!process.env.WEBHOOK_URL) {
          failures.push("webhook: set WEBHOOK_URL.");
        } else {
          try {
            await notify.sendWebhook(rt.client, {
              url: process.env.WEBHOOK_URL,
              payload: notify.webhookPayload(items),
            });
            log.info("webhook: posted " + items.length + " job(s).");
          } catch (error) {
            failures.push("webhook: " + http.describeError(error));
          }
        }
      }

      if (failures.length > 0) {
        failures.forEach(function (message) {
          log.error(message);
        });
        // Roll back "seen" stamps so the next run retries these alerts —
        // but count attempts per ATTEMPTED url, so one poison job can't fail
        // every run forever (3 strikes quarantines it; see above).
        items.forEach(function (item) {
          state.quarantine[item.url] = (state.quarantine[item.url] || 0) + 1;
          delete state.jobs[item.url];
        });
      } else {
        items.forEach(function (item) {
          delete state.quarantine[item.url];
        });
        if (notifyDb) {
          notifyDb.recordMany(
            items.map(function (item) {
              return {
                url: item.url,
                title: item.title,
                payload: { transports: targets },
              };
            })
          );
          log.info(
            "recorded " + items.length + " notified job(s) in " + values.db
          );
        }
      }
    }
  }

  if (notifyDb) {
    notifyDb.close();
  }

  try {
    if (!values.dryRun) digest.saveState(statePath, state);
  } catch (error) {
    log.error("could not write state to " + statePath + ": " + error.message);
    process.exit(1);
  }
  if (failures.length > 0) {
    process.exit(1);
  }
}

main();
