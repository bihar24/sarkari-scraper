"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var logger = require("../utils/logger");

function capture(fn) {
  var lines = [];
  var original = console.error;
  console.error = function (message) {
    lines.push(message);
  };
  try {
    fn();
  } finally {
    console.error = original;
  }
  return lines;
}

describe("logger", function () {
  it("defaults to info level", function () {
    var log = logger.createLogger({});
    assert.equal(log.level, "info");
    var lines = capture(function () {
      log.debug("d");
      log.info("i");
      log.warn("w");
      log.error("e");
    });
    assert.equal(lines.length, 3);
    assert.match(lines[0], /\[info\]/);
  });

  it("quiet shows errors only, verbose shows everything", function () {
    var quiet = logger.createLogger({ quiet: true });
    var quietLines = capture(function () {
      quiet.warn("w");
      quiet.error("e");
    });
    assert.equal(quietLines.length, 1);

    var verbose = logger.createLogger({ verbose: true });
    assert.equal(verbose.level, "debug");
    var verboseLines = capture(function () {
      verbose.debug("d");
    });
    assert.equal(verboseLines.length, 1);
  });

  it("honours LOG_LEVEL and falls back on garbage", function () {
    var previous = process.env.LOG_LEVEL;
    try {
      process.env.LOG_LEVEL = "warn";
      assert.equal(logger.createLogger({}).level, "warn");
      process.env.LOG_LEVEL = "nonsense";
      assert.equal(logger.createLogger({}).level, "info");
    } finally {
      if (previous === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previous;
      }
    }
  });
});
