"use strict";

// Bounded-concurrency worker pool. Results preserve input order; per-item
// failures are captured (never thrown), so one bad page can't kill a run.

var helper = require("./helper");

async function runPool(items, worker, options) {
  options = options || {};
  var concurrency = Math.max(1, options.concurrency || 1);
  var delayMs = options.delayMs || 0;

  var results = new Array(items.length);
  var next = 0;

  async function runOne() {
    while (true) {
      var index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      try {
        var value = await worker(items[index], index);
        results[index] = { ok: true, value: value };
      } catch (error) {
        results[index] = { ok: false, error: error };
      }
      if (delayMs > 0 && next < items.length) {
        await helper.sleep(delayMs);
      }
    }
  }

  var lanes = [];
  var count = Math.min(concurrency, Math.max(items.length, 1));
  var i;
  for (i = 0; i < count; i++) {
    lanes.push(runOne());
  }
  await Promise.all(lanes);
  return results;
}

module.exports.runPool = runPool;
