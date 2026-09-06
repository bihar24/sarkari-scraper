"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var csv = require("../utils/csv");

describe("csv.formatData", function () {
  it("formats List/Paragraph/Link/Table values without mutating input", function () {
    var input = [
      { key: "A", value: ["x", "y"], type: "List" },
      { key: "B", value: ["p1", "p2"], type: "Paragraph" },
      {
        key: "C",
        value: [{ text: "Apply", link: "https://x.com/a" }],
        type: "Link",
      },
      {
        key: "D",
        value: [
          [
            { value: "h1", type: "String" },
            { value: "h2", type: "String" },
          ],
        ],
        type: "Table",
      },
      { key: "E", value: "plain", type: "String" },
    ];
    var snapshot = JSON.parse(JSON.stringify(input));
    var out = csv.formatData(input);

    assert.deepEqual(input, snapshot); // input untouched
    assert.equal(out[0].value, "• x\n• y");
    assert.equal(out[1].value, "p1\np2"); // Paragraph was previously ignored
    assert.equal(out[2].value, "Apply ( https://x.com/a )");
    assert.match(out[3].value, /h1/);
    assert.match(out[3].value, /h2/);
    assert.equal(out[4].value, "plain");
  });
});

describe("csv.formatLink", function () {
  it("tolerates null text/link entries", function () {
    assert.equal(csv.formatLink([{ text: null, link: null }]), "");
    assert.equal(csv.formatLink([{ text: "Only", link: null }]), "Only");
    assert.equal(csv.formatLink(null), "");
  });
});

describe("csv.formatTable", function () {
  it("expands rowspan/colspan onto the right grid slots", function () {
    var out = csv.formatTable([
      [
        { value: "A", type: "String", rowspan: "2" },
        { value: "B", type: "String" },
      ],
      [{ value: "C", type: "String" }],
    ]);
    // A spans rows 1-2 of column 1, so C must land in column 2 of row 2.
    var aRow = out.split("\n").find(function (line) {
      return line.includes("A");
    });
    var cRow = out.split("\n").find(function (line) {
      return line.includes("C");
    });
    assert.ok(aRow && aRow.includes("B"));
    assert.ok(cRow && !cRow.includes("A"));
    assert.ok(cRow && cRow.includes("C"));
  });

  it("renders Link/List cells and survives empty input", function () {
    var out = csv.formatTable([
      [
        {
          value: [{ text: "T", link: "https://x.com" }],
          type: "Link",
        },
        { value: ["i1", "i2"], type: "List" },
      ],
    ]);
    assert.match(out, /T \( https:\/\/x\.com \)/);
    assert.match(out, /• i1/);
    assert.equal(csv.formatTable([]), "");
    assert.equal(csv.formatTable(null), "");
  });
});

describe("csv.parse", function () {
  it("returns an empty string for empty data instead of throwing", function () {
    assert.equal(csv.parse([]), "");
  });

  it("converts rows to CSV", function () {
    var out = csv.parse([
      { a: 1, b: "x,y" },
      { a: 2, b: "z" },
    ]);
    assert.match(out, /"a","b"/);
    assert.match(out, /"x,y"/);
  });
});
