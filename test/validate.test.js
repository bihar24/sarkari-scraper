"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var validate = require("../utils/validate");

describe("validate.checkJobList", function () {
  it("passes clean lists and flags missing links/titles", function () {
    assert.deepEqual(
      validate.checkJobList([{ postName: "A", link: "https://x/1" }]),
      []
    );
    var warnings = validate.checkJobList([
      { postName: "A" },
      { link: "https://x/2" },
    ]);
    assert.equal(warnings.length, 2);
    assert.match(warnings.join(" "), /no link/);
    assert.match(warnings.join(" "), /no title/);
    assert.deepEqual(validate.checkJobList("nope").length, 1);
  });

  it("counts only usable job list records", function () {
    assert.equal(
      validate.countUsableJobItems([
        { postName: "A", link: "https://x/1" },
        { link: "https://x/2" },
        { postName: "B", link: "javascript:no" },
        { company: "Office", link: "https://x/3" },
      ]),
      2
    );
  });
});

describe("validate.checkJobDetail", function () {
  it("passes clean records and flags unknown types and empties", function () {
    assert.deepEqual(
      validate.checkJobDetail([
        { key: "A", value: "v", type: "String" },
        { key: "B", value: ["x"], type: "List" },
      ]),
      []
    );
    var warnings = validate.checkJobDetail([
      { key: "A", value: "v", type: "Mystery" },
      { key: null, value: null, type: "String" },
    ]);
    assert.equal(warnings.length, 2);
    assert.match(warnings.join(" "), /Mystery/);
    assert.match(warnings.join(" "), /empty/);
  });
});

describe("validate.checkPaperList", function () {
  it("passes clean lists and flags missing links/titles", function () {
    assert.deepEqual(
      validate.checkPaperList([
        { exam: "SSC CGL", title: "SSC CGL Papers", link: "https://x/1" },
      ]),
      []
    );
    var warnings = validate.checkPaperList([
      { exam: "SSC CGL" },
      { link: "https://x/2" },
    ]);
    assert.equal(warnings.length, 2);
    assert.match(warnings.join(" "), /no link/);
    assert.match(warnings.join(" "), /no title/);
    assert.deepEqual(validate.checkPaperList("nope").length, 1);
  });

  it("counts only usable paper list records", function () {
    assert.equal(
      validate.countUsablePaperItems([
        { exam: "SSC CGL", link: "https://x/1" },
        { link: "https://x/2" },
      ]),
      1
    );
  });
});
