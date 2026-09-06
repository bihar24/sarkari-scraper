"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var httpServer = require("node:http");
var http = require("../utils/http");

function withEnv(patch, fn) {
  var keys = Object.keys(patch);
  var previous = {};
  keys.forEach(function (key) {
    previous[key] = process.env[key];
    if (patch[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = patch[key];
    }
  });
  function restore() {
    keys.forEach(function (key) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    });
  }
  var result;
  try {
    result = fn();
  } catch (err) {
    restore();
    throw err;
  }
  if (result && typeof result.then === "function") {
    return result.then(
      function (value) {
        restore();
        return value;
      },
      function (err) {
        restore();
        throw err;
      }
    );
  }
  restore();
  return result;
}

describe("http proxy resolution", function () {
  it("parses explicit proxy URLs with auth", function () {
    var resolved = withEnv(
      {
        HTTPS_PROXY: undefined,
        https_proxy: undefined,
        HTTP_PROXY: undefined,
        http_proxy: undefined,
      },
      function () {
        return http.resolveProxy("http://user:p%40ss@proxy.test:3128");
      }
    );
    assert.equal(resolved.via, "http://proxy.test:3128");
    assert.deepEqual(resolved.proxy, {
      protocol: "http",
      host: "proxy.test",
      port: 3128,
      auth: { username: "user", password: "p@ss" },
    });
  });

  it("falls back to env vars and rejects bad URLs", function () {
    var resolved = withEnv(
      { HTTPS_PROXY: "http://env.test:8080" },
      function () {
        return http.resolveProxy(null);
      }
    );
    assert.equal(resolved.via, "http://env.test:8080");

    assert.throws(function () {
      http.resolveProxy("::not-a-url::");
    }, /Invalid proxy URL/);
    assert.throws(function () {
      http.resolveProxy("socks5://proxy.test:1080");
    }, /must use http/);
  });

  it("disables proxying when nothing is configured", function () {
    var resolved = withEnv(
      {
        HTTPS_PROXY: undefined,
        https_proxy: undefined,
        HTTP_PROXY: undefined,
        http_proxy: undefined,
      },
      function () {
        return http.resolveProxy(null);
      }
    );
    assert.deepEqual(resolved, { proxy: false, via: null });
  });

  it("matches NO_PROXY entries", function () {
    assert.equal(http.noProxyMatch("x.com", "x.com, y.com"), true);
    assert.equal(http.noProxyMatch("a.x.com", ".x.com"), true);
    assert.equal(http.noProxyMatch("a.x.com", "x.com"), true);
    assert.equal(http.noProxyMatch("other.com", "x.com"), false);
    assert.equal(http.noProxyMatch("anything.test", "*"), true);
    assert.equal(http.noProxyMatch("x.com", ""), false);
  });

  it("bypasses a dead proxy for NO_PROXY hosts", async function () {
    var server = httpServer.createServer(function (req, res) {
      res.end("direct");
    });
    await new Promise(function (resolve) {
      server.listen(0, "127.0.0.1", resolve);
    });
    var base = "http://127.0.0.1:" + server.address().port;
    try {
      await withEnv(
        { NO_PROXY: "127.0.0.1", no_proxy: undefined },
        async function () {
          var client = http.createClient({
            proxyUrl: "http://127.0.0.1:9",
            timeoutMs: 5000,
          });
          var response = await client.get(base + "/x");
          assert.equal(response.data, "direct");
        }
      );
    } finally {
      server.close();
    }
  });
});
