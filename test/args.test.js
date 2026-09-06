"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var args = require("../utils/args");

var SPEC = [
  {
    key: "domain",
    flags: ["-d", "--domain"],
    allowed: ["a.com", "b.com"],
    defaultValue: "a.com",
  },
  { key: "filename", flags: ["-o", "--output"], required: true },
  {
    key: "maxPages",
    flags: ["--max-pages"],
    defaultValue: 50,
    parse: args.parseNonNegativeInt("max-pages"),
  },
];

describe("args.parseArgs", function () {
  it("parses short flags, long flags and --flag=value", function () {
    var parsed = args.parseArgs(
      ["-d", "b.com", "--output=x.csv", "--max-pages", "3"],
      SPEC
    );
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.values.domain, "b.com");
    assert.equal(parsed.values.filename, "x.csv");
    assert.equal(parsed.values.maxPages, 3);
  });

  it("applies defaults", function () {
    var parsed = args.parseArgs(["-o", "f"], SPEC);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.values.domain, "a.com");
    assert.equal(parsed.values.maxPages, 50);
  });

  it("reports missing values, bad values and missing required flags", function () {
    var missing = args.parseArgs(["-d"], SPEC);
    assert.match(missing.errors.join(" "), /expects a value/);

    var bad = args.parseArgs(["-d", "evil.com", "-o", "f"], SPEC);
    assert.match(bad.errors.join(" "), /Invalid value/);

    var required = args.parseArgs(["-d", "a.com"], SPEC);
    assert.match(required.errors.join(" "), /Missing required flag/);

    var notInt = args.parseArgs(["-o", "f", "--max-pages", "x"], SPEC);
    assert.match(notInt.errors.join(" "), /non-negative integer/);
  });

  it("warns on unknown flags and detects --help", function () {
    var parsed = args.parseArgs(["-o", "f", "--nope", "-h"], SPEC);
    assert.equal(parsed.warnings.length, 1);
    assert.match(parsed.warnings[0], /Unknown flag/);
    assert.equal(parsed.helpRequested, true);
  });
});

describe("args.parseArgs boolean flags", function () {
  var boolSpec = [
    { key: "quiet", flags: ["--quiet"], boolean: true, defaultValue: false },
    { key: "out", flags: ["-o"], required: true },
  ];

  it("sets presence flags without consuming the next token", function () {
    var parsed = args.parseArgs(["--quiet", "-o", "f"], boolSpec);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.values.quiet, true);
    assert.equal(parsed.values.out, "f");
  });

  it("defaults to false and rejects inline values", function () {
    var absent = args.parseArgs(["-o", "f"], boolSpec);
    assert.equal(absent.values.quiet, false);
    var inline = args.parseArgs(["--quiet=true", "-o", "f"], boolSpec);
    assert.match(inline.errors.join(" "), /takes no value/);
  });
});
