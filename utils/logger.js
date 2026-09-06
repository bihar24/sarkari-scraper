"use strict";

// Tiny levelled logger (stderr only, so stdout stays pure data).
// Level order: error < warn < info < debug.

var LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function normalizeLevel(level) {
  if (typeof level !== "string") {
    return "info";
  }
  var cleaned = level.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEVELS, cleaned)) {
    return cleaned;
  }
  return "info";
}

function resolveLevel(options) {
  options = options || {};
  if (options.quiet) {
    return "error";
  }
  if (options.verbose) {
    return "debug";
  }
  if (options.level) {
    return normalizeLevel(options.level);
  }
  if (process.env.LOG_LEVEL) {
    return normalizeLevel(process.env.LOG_LEVEL);
  }
  return "info";
}

function createLogger(options) {
  var level = resolveLevel(options);

  function enabled(wanted) {
    return LEVELS[wanted] <= LEVELS[level];
  }

  function write(wanted, message) {
    if (!enabled(wanted)) {
      return;
    }
    var stamp = new Date().toISOString();
    console.error("[" + stamp + "] [" + wanted + "] " + message);
  }

  return {
    level: level,
    error: function (message) {
      write("error", message);
    },
    warn: function (message) {
      write("warn", message);
    },
    info: function (message) {
      write("info", message);
    },
    debug: function (message) {
      write("debug", message);
    },
  };
}

module.exports.createLogger = createLogger;
module.exports.LEVELS = LEVELS;
