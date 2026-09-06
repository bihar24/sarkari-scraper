"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");

var sources = require("../utils/sources");
var constant = require("../utils/constant");

describe("utils/sources registry", function () {
  it("catalogs jobs and papers domains", function () {
    assert.equal(sources.jobDomains().length, 7);
    assert.deepEqual(sources.paperDomains(), ["upsc.gov.in", "adda247.com"]);
    assert.ok(sources.isSupported("freejobalert.com", "jobs"));
    assert.ok(!sources.isSupported("freejobalert.com", "papers"));
    assert.ok(!sources.isSupported("nope.invalid", "jobs"));
  });

  it("reports stable vs beta statuses", function () {
    assert.equal(sources.statusOf("sarkariresult.com", "jobs"), "stable");
    assert.equal(sources.statusOf("freejobalert.com", "jobs"), "beta");
    assert.equal(sources.statusOf("upsc.gov.in", "papers"), "beta");
    assert.equal(sources.statusOf("upsc.gov.in", "jobs"), null);
  });

  it("loads the registered parsers", function () {
    assert.equal(
      typeof sources.requireListParser("sarkariresult.com", "jobs")
        .scrapJobList,
      "function"
    );
    assert.equal(
      typeof sources.requireDetailParser("freejobalert.com", "jobs")
        .scrapJobDetail,
      "function"
    );
    assert.equal(
      typeof sources.requireListParser("upsc.gov.in", "papers").scrapPaperList,
      "function"
    );
    assert.equal(
      typeof sources.requireDetailParser("adda247.com", "papers")
        .scrapPaperDetail,
      "function"
    );
    assert.throws(function () {
      sources.requireListParser("sarkariresult.com", "papers");
    });
  });

  it("derives the constant domain lists", function () {
    assert.deepEqual(constant.DOMAIN_LIST, sources.jobDomains());
    assert.deepEqual(constant.PAPER_DOMAIN_LIST, sources.paperDomains());
    assert.equal(constant.DEFAULT_PAPER_DOMAIN, "adda247.com");
  });

  it("formats a human-readable catalog", function () {
    var catalog = sources.formatCatalog();
    assert.ok(catalog.indexOf("freejobalert.com") !== -1);
    assert.ok(catalog.indexOf("jobs: beta") !== -1);
    assert.ok(catalog.indexOf("papers: beta") !== -1);
    assert.ok(catalog.indexOf("docs/SOURCES.md") !== -1);
  });
});
