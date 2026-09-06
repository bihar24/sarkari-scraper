"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var bloom = require("../utils/bloom");

describe("utils/bloom", function () {
  it("finds added keys and (almost) never misses them", function () {
    var filter = new bloom.BloomFilter({ items: 1000, fpRate: 0.01 });
    var i;
    for (i = 0; i < 500; i++) {
      filter.add("https://site.test/job/" + i);
    }
    for (i = 0; i < 500; i++) {
      assert.equal(filter.has("https://site.test/job/" + i), true);
    }
    assert.equal(filter.has("https://site.test/job/never-added"), false);
  });

  it("has no false negatives on random keys", function () {
    var filter = new bloom.BloomFilter({ items: 200, fpRate: 0.05 });
    var keys = [];
    var i;
    for (i = 0; i < 200; i++) {
      keys.push("key-" + Math.random() + "-" + i);
      filter.add(keys[i]);
    }
    keys.forEach(function (key) {
      assert.equal(filter.has(key), true);
    });
  });

  it("round-trips through JSON", function () {
    var filter = new bloom.BloomFilter({ items: 100, fpRate: 0.01 });
    filter.add("a");
    filter.add("b");
    var revived = bloom.BloomFilter.fromJSON(
      JSON.parse(JSON.stringify(filter.toJSON()))
    );
    assert.equal(revived.has("a"), true);
    assert.equal(revived.has("b"), true);
    assert.equal(revived.has("zzz"), false);
    assert.equal(revived.count, 2);
    assert.throws(function () {
      bloom.BloomFilter.fromJSON({ nope: true });
    });
  });

  it("sizes itself and reports honest fp rates", function () {
    assert.ok(bloom.optimalBits(10000, 0.01) > 90000);
    assert.ok(bloom.optimalHashes(bloom.optimalBits(10000, 0.01), 10000) >= 5);
    var filter = new bloom.BloomFilter({ items: 1000, fpRate: 0.01 });
    assert.equal(filter.fpRate(), 0);
    var i;
    for (i = 0; i < 1000; i++) {
      filter.add("k" + i);
    }
    var rate = filter.fpRate();
    assert.ok(rate > 0.001 && rate < 0.05);
  });
});
