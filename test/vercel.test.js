"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var root = path.join(__dirname, "..");

test.describe("Vercel deployment contract", function () {
  test.it(
    "publishes only built web assets and routes dynamic paths to one function",
    function () {
      var config = JSON.parse(
        fs.readFileSync(path.join(root, "vercel.json"), "utf8")
      );
      var pkg = JSON.parse(
        fs.readFileSync(path.join(root, "package.json"), "utf8")
      );
      assert.equal(config.framework, null);
      assert.equal(config.buildCommand, "npm run build");
      assert.equal(config.outputDirectory, "dist");
      assert.equal(pkg.scripts.build, "node tools/build-site.js");
      assert.equal(config.functions["api/index.js"].maxDuration, 10);

      var rewrites = new Map(
        config.rewrites.map(function (rule) {
          return [rule.source, rule.destination];
        })
      );
      ["/api/v1", "/api/v1/:path*", "/feed.xml", "/health"].forEach(
        function (source) {
          assert.equal(rewrites.get(source), "/api");
        }
      );
      assert.equal(rewrites.has("/(.*)"), false);
    }
  );

  test.it(
    "keeps the Vercel function serverless and the root output as HTML",
    function () {
      var entry = fs.readFileSync(path.join(root, "api/index.js"), "utf8");
      var html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
      assert.doesNotMatch(entry, /\.listen\s*\(/);
      assert.match(entry, /createRequestHandler/);
      assert.match(html, /^<!doctype html>/i);
      assert.doesNotMatch(html, /module\.exports\s*=/);
    }
  );
});
