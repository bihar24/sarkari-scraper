"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var digest = require("../utils/digest");

function sampleJob(url) {
  return {
    url: url || "https://site.test/job/1",
    detail: [
      { key: "Post Link", value: [{ text: "Link", link: url }], type: "Link" },
      { key: "Name of Post", value: "Clerk (100 posts)", type: "String" },
      { key: "Header", value: ["UPSC", "Advt 5/2026"], type: "List" },
      { key: "Last Date", value: "15-Aug-2026", type: "String" },
      { key: "Fees", value: ["Rs 100", "No fee for SC"], type: "List" },
    ],
  };
}

describe("digest extraction", function () {
  it("prefers Name of Post, then Header, then first string", function () {
    assert.equal(digest.extractTitle(sampleJob()), "Clerk (100 posts)");
    var noName = sampleJob();
    noName.detail = noName.detail.filter(function (row) {
      return row.key !== "Name of Post";
    });
    assert.equal(digest.extractTitle(noName), "UPSC — Advt 5/2026");
    assert.equal(
      digest.extractTitle({ url: "https://x.test/a/b", detail: [] }),
      "x.test/a/b"
    );
  });

  it("titles papers and generic article records", function () {
    assert.equal(
      digest.extractTitle({
        url: "https://www.upsc.gov.in/x",
        detail: [
          { key: "Post Link", value: [], type: "Link" },
          {
            key: "Civil Services (Preliminary) 2024",
            value: [{ text: "General Studies", link: "https://x/a.pdf" }],
            type: "Link",
          },
        ],
      }),
      "Civil Services (Preliminary) 2024"
    );
    assert.equal(
      digest.extractTitle({
        url: "https://www.adda247.com/x",
        detail: [
          { key: "Post Link", value: [], type: "Link" },
          {
            key: "Exam",
            value: "SSC CPO Previous Year Question Paper",
            type: "String",
          },
        ],
      }),
      "Exam: SSC CPO Previous Year Question Paper"
    );
    assert.equal(
      digest.extractTitle({
        url: "https://site.test/job/9",
        detail: [
          { key: "Post Link", value: [], type: "Link" },
          {
            key: "Vacancy Details",
            value: [[{ value: "Clerk", type: "String" }]],
            type: "Table",
          },
        ],
      }),
      "Vacancy Details"
    );
  });

  it("extracts text and deadlines", function () {
    var text = digest.extractText(sampleJob());
    assert.match(text, /Clerk \(100 posts\)/);
    assert.match(text, /Rs 100/);
    assert.doesNotMatch(text, /Post Link/); // Link records excluded
    var deadline = digest.extractDeadline(sampleJob());
    assert.equal(deadline.raw, "15-Aug-2026");
    assert.equal(deadline.parsed.toISOString().slice(0, 10), "2026-08-15");
    assert.equal(digest.extractDeadline({ detail: [] }), null);
  });

  it("finds 6-digit pincodes but not phone numbers or years", function () {
    assert.deepEqual(
      digest.extractPincodes(
        "Apply at Patna 800001 or Delhi 110006; call 9876543210. Year 2026."
      ),
      ["800001", "110006"]
    );
    assert.deepEqual(digest.extractPincodes("no pins here 12345 1234567"), []);
  });
});

describe("digest state and diff", function () {
  it("flags only unseen jobs and stamps sightings", function () {
    var state = digest.blankState();
    var jobs = [sampleJob("https://x/1"), sampleJob("https://x/2")];
    var first = digest.diffJobs(jobs, state);
    assert.equal(first.fresh.length, 2);

    var second = digest.diffJobs(
      [sampleJob("https://x/2"), sampleJob("https://x/3")],
      first.state
    );
    assert.equal(second.fresh.length, 1);
    assert.equal(second.fresh[0].url, "https://x/3");
    assert.ok(second.state.jobs["https://x/2"].lastSeen);
  });

  it("round-trips state files and starts fresh when missing", function () {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-"));
    var file = path.join(dir, "state.json");
    var loaded = digest.loadState(file);
    assert.equal(loaded.fresh, true);
    digest.cacheSet(loaded.state, "k", { v: 1 });
    digest.saveState(file, loaded.state);
    var again = digest.loadState(file);
    assert.equal(again.fresh, false);
    assert.deepEqual(digest.cacheGet(again.state, "k"), { v: 1 });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("loads job files and skips failed entries", function () {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-"));
    var file = path.join(dir, "jobs.json");
    fs.writeFileSync(
      file,
      JSON.stringify([
        sampleJob(),
        { url: "https://x/bad", detail: null, error: "nope" },
      ])
    );
    assert.equal(digest.loadJobsFile(file).length, 1);
    assert.throws(function () {
      digest.loadJobsFile(path.join(dir, "missing.json"));
    }, /cannot read/);
    fs.writeFileSync(file, "not json");
    assert.throws(function () {
      digest.loadJobsFile(file);
    }, /not valid JSON/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
