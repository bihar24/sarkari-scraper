"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var runtime = require("../utils/runtime");

describe("runtime.createRuntime", function () {
  it("builds a logger, client and robots checker", function () {
    var rt = runtime.createRuntime({
      quiet: false,
      verbose: true,
      timeoutMs: 1000,
      retries: 1,
      retryDelayMs: 10,
      proxyUrl: null,
    });
    assert.equal(rt.log.level, "debug");
    assert.equal(typeof rt.client.get, "function");
    assert.equal(typeof rt.robots.isAllowed, "function");
  });

  it("throws on invalid proxy configuration", function () {
    assert.throws(function () {
      runtime.createRuntime({
        timeoutMs: 1000,
        retries: 1,
        retryDelayMs: 10,
        proxyUrl: "::bad::",
      });
    }, /Invalid proxy URL/);
  });
});

describe("runtime.ensureRobotsAllowed", function () {
  it("passes when ignored, allowed, and blocks when disallowed", async function () {
    var calls = 0;
    var stub = {
      isAllowed: async function () {
        calls += 1;
        return { allowed: false, reason: "disallowed by robots.txt" };
      },
    };
    var silent = { error: function () {}, debug: function () {} };

    assert.equal(
      await runtime.ensureRobotsAllowed(stub, "https://x.test/a", {
        ignore: true,
        log: silent,
      }),
      true
    );
    assert.equal(calls, 0);

    assert.equal(
      await runtime.ensureRobotsAllowed(stub, "https://x.test/a", {
        ignore: false,
        log: silent,
      }),
      false
    );

    var open = {
      isAllowed: async function () {
        return { allowed: true, reason: "allowed by robots.txt" };
      },
    };
    assert.equal(
      await runtime.ensureRobotsAllowed(open, "https://x.test/a", {
        ignore: false,
        log: silent,
      }),
      true
    );
  });
});
