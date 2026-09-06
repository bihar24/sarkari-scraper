"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var pool = require("../utils/pool");

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

describe("pool.runPool", function () {
  it("preserves input order despite out-of-order completion", async function () {
    var results = await pool.runPool(
      [30, 10, 20],
      async function (ms, index) {
        await sleep(ms);
        return "item-" + index;
      },
      { concurrency: 3 }
    );
    assert.deepEqual(
      results.map(function (entry) {
        return entry.value;
      }),
      ["item-0", "item-1", "item-2"]
    );
    assert.ok(
      results.every(function (entry) {
        return entry.ok;
      })
    );
  });

  it("captures per-item errors without aborting the run", async function () {
    var results = await pool.runPool(
      [1, 2, 3],
      async function (n) {
        if (n === 2) {
          throw new Error("bad apple");
        }
        return n * 10;
      },
      { concurrency: 2 }
    );
    assert.equal(results[0].value, 10);
    assert.equal(results[1].ok, false);
    assert.match(results[1].error.message, /bad apple/);
    assert.equal(results[2].value, 30);
  });

  it("never exceeds the concurrency cap", async function () {
    var active = 0;
    var peak = 0;
    await pool.runPool(
      [1, 2, 3, 4, 5, 6],
      async function () {
        active += 1;
        peak = Math.max(peak, active);
        await sleep(15);
        active -= 1;
      },
      { concurrency: 2 }
    );
    assert.equal(peak, 2);
  });

  it("handles empty input", async function () {
    var results = await pool.runPool([], async function () {
      throw new Error("must not run");
    });
    assert.deepEqual(results, []);
  });
});
