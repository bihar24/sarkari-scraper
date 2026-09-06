"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var httpServer = require("node:http");
var axios = require("axios");
var retry = require("../utils/retry");

function flakyServer(handler) {
  var calls = 0;
  var server = httpServer.createServer(function (req, res) {
    calls += 1;
    handler(calls, req, res);
  });
  return {
    calls: function () {
      return calls;
    },
    start: function () {
      return new Promise(function (resolve) {
        server.listen(0, "127.0.0.1", function () {
          resolve("http://127.0.0.1:" + server.address().port);
        });
      });
    },
    stop: function () {
      server.close();
    },
  };
}

describe("retry.addRetryInterceptor", function () {
  it("retries 5xx then succeeds", async function () {
    var srv = flakyServer(function (calls, req, res) {
      if (calls < 3) {
        res.statusCode = 500;
        res.end("boom");
      } else {
        res.end("ok");
      }
    });
    var base = await srv.start();
    try {
      var client = axios.create();
      retry.addRetryInterceptor(client, { retries: 3, baseDelayMs: 5 });
      var response = await client.get(base + "/x");
      assert.equal(response.data, "ok");
      assert.equal(srv.calls(), 3);
    } finally {
      srv.stop();
    }
  });

  it("gives up after the configured retries", async function () {
    var srv = flakyServer(function (calls, req, res) {
      res.statusCode = 503;
      res.end("down");
    });
    var base = await srv.start();
    try {
      var client = axios.create();
      retry.addRetryInterceptor(client, { retries: 2, baseDelayMs: 5 });
      await assert.rejects(client.get(base + "/x"), /503/);
      assert.equal(srv.calls(), 3); // 1 initial + 2 retries
    } finally {
      srv.stop();
    }
  });

  it("does not retry 4xx (except 429)", async function () {
    var srv = flakyServer(function (calls, req, res) {
      res.statusCode = 404;
      res.end("nope");
    });
    var base = await srv.start();
    try {
      var client = axios.create();
      retry.addRetryInterceptor(client, { retries: 3, baseDelayMs: 5 });
      await assert.rejects(client.get(base + "/x"), /404/);
      assert.equal(srv.calls(), 1);
    } finally {
      srv.stop();
    }
  });

  it("retries 429 and honours Retry-After", async function () {
    var srv = flakyServer(function (calls, req, res) {
      if (calls === 1) {
        res.statusCode = 429;
        res.setHeader("retry-after", "0");
        res.end("slow down");
      } else {
        res.end("ok");
      }
    });
    var base = await srv.start();
    try {
      var client = axios.create();
      retry.addRetryInterceptor(client, { retries: 3, baseDelayMs: 5 });
      var response = await client.get(base + "/x");
      assert.equal(response.data, "ok");
      assert.equal(srv.calls(), 2);
    } finally {
      srv.stop();
    }
  });
});

describe("retry helpers", function () {
  it("classifies retryable failures", function () {
    assert.equal(retry.isRetryable({ code: "ECONNABORTED" }), true);
    assert.equal(retry.isRetryable({ code: "ECONNRESET" }), true);
    assert.equal(retry.isRetryable({ response: { status: 500 } }), true);
    assert.equal(retry.isRetryable({ response: { status: 429 } }), true);
    assert.equal(retry.isRetryable({ response: { status: 400 } }), false);
    assert.equal(retry.isRetryable({ response: { status: 404 } }), false);
    assert.equal(retry.isRetryable({ code: "ERR_CANCELED" }), false);
    assert.equal(retry.isRetryable(null), false);
  });

  it("parses Retry-After seconds, dates and garbage", function () {
    assert.equal(
      retry.retryAfterMs({ response: { headers: { "retry-after": "2" } } }),
      2000
    );
    assert.equal(
      retry.retryAfterMs({
        response: { headers: { "retry-after": "garbage" } },
      }),
      0
    );
    assert.equal(retry.retryAfterMs({ response: { headers: {} } }), 0);
    var future = new Date(Date.now() + 5000).toUTCString();
    var ms = retry.retryAfterMs({
      response: { headers: { "retry-after": future } },
    });
    assert.ok(ms > 1000 && ms <= 5000);
  });

  it("backs off exponentially within the cap", function () {
    var d0 = retry.computeDelay(0, 1000);
    var d1 = retry.computeDelay(1, 1000);
    var dBig = retry.computeDelay(99, 1000);
    assert.ok(d0 >= 1000 && d0 < 2000);
    assert.ok(d1 >= 2000 && d1 < 3000);
    assert.ok(dBig <= 30000);
  });
});
