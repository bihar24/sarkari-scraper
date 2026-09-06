"use strict";

// Persistent Bloom filter: a tiny, fast "have we seen this?" pre-check with
// NO false negatives (if it says new, it is definitely new) and a bounded
// false-positive rate. Positives are always confirmed against the exact
// store (utils/notifydb.js), so users never see a false "already notified".
//
// Hashing: double-hashing from one SHA-256 digest (crypto has no new deps).
// Sizing: m = -n*ln(p)/(ln2^2) bits, k = (m/n)*ln2 hashes.

var crypto = require("crypto");

function optimalBits(count, fpRate) {
  var p = Math.min(0.5, Math.max(0.000001, fpRate));
  var n = Math.max(1, count);
  return Math.ceil((-n * Math.log(p)) / Math.pow(Math.log(2), 2) / 8) * 8;
}

function optimalHashes(bitCount, count) {
  return Math.max(1, Math.round((bitCount / Math.max(1, count)) * Math.log(2)));
}

function BloomFilter(options) {
  options = options || {};
  this.bits =
    options.bits || optimalBits(options.items || 10000, options.fpRate || 0.01);
  this.hashes =
    options.hashes || optimalHashes(this.bits, options.items || 10000);
  this.count = options.count || 0;
  if (options.bytes) {
    this.bytes = Buffer.from(options.bytes);
    if (this.bytes.length !== Math.ceil(this.bits / 8)) {
      throw new Error("bloom byte length does not match bit size");
    }
  } else {
    this.bytes = Buffer.alloc(Math.ceil(this.bits / 8));
  }
}

// Two 32-bit hashes from SHA-256; combined into k positions (double hashing).
BloomFilter.prototype.positions = function (key) {
  var digest = crypto.createHash("sha256").update(String(key), "utf8").digest();
  var h1 = digest.readUInt32BE(0);
  // >>> 0: keep h2 an unsigned 32-bit int (| 1 alone would go negative half
  // the time, producing negative bit positions).
  var h2 = (digest.readUInt32BE(4) | 1) >>> 0;
  var out = [];
  for (var i = 0; i < this.hashes; i++) {
    out.push((h1 + i * h2) % this.bits);
  }
  return out;
};

BloomFilter.prototype.add = function (key) {
  var positions = this.positions(key);
  for (var i = 0; i < positions.length; i++) {
    var byte = Math.floor(positions[i] / 8);
    var mask = 1 << (positions[i] % 8);
    this.bytes[byte] |= mask;
  }
  this.count += 1;
  return this;
};

BloomFilter.prototype.has = function (key) {
  var positions = this.positions(key);
  for (var i = 0; i < positions.length; i++) {
    var byte = Math.floor(positions[i] / 8);
    var mask = 1 << (positions[i] % 8);
    if ((this.bytes[byte] & mask) === 0) {
      return false;
    }
  }
  return true;
};

// Estimated current false-positive rate for the inserted count.
BloomFilter.prototype.fpRate = function () {
  if (this.count === 0) {
    return 0;
  }
  var fill = 1 - Math.exp((-this.hashes * this.count) / this.bits);
  return Math.pow(fill, this.hashes);
};

BloomFilter.prototype.toJSON = function () {
  return {
    bits: this.bits,
    hashes: this.hashes,
    count: this.count,
    bytes: this.bytes.toString("base64"),
  };
};

BloomFilter.fromJSON = function (data) {
  if (!data || !data.bits || !data.hashes || !data.bytes) {
    throw new Error("not a serialized bloom filter");
  }
  return new BloomFilter({
    bits: data.bits,
    hashes: data.hashes,
    count: data.count || 0,
    bytes: Buffer.from(data.bytes, "base64"),
  });
};

// Scalable Bloom filter (Almeida et al.): layers with geometrically growing
// capacity and tightening fp rates. Same add/has interface, no fixed ceiling,
// no false negatives. Serializes alongside the classic shape — fromJSON
// dispatches on content, so old single-filter snapshots keep loading.
function ScalableBloomFilter(options) {
  options = options || {};
  this.growth = options.growth || 2;
  this.tightening = options.tightening || 0.5;
  this.count = 0;
  this.layers = [];
  if (options.layers) {
    var self = this;
    options.layers.forEach(function (entry) {
      self.layers.push({
        filter: entry.filter,
        capacity: entry.capacity,
        fp: entry.fp,
        count: entry.count || 0,
      });
      self.count += entry.count || 0;
    });
  } else {
    this.addLayer(options.capacity || 1000, options.fpRate || 0.01);
  }
}

ScalableBloomFilter.prototype.addLayer = function (capacity, fpRate) {
  var fp = Math.max(0.000001, fpRate);
  var bits = optimalBits(capacity, fp);
  this.layers.push({
    filter: new BloomFilter({
      bits: bits,
      hashes: optimalHashes(bits, capacity),
    }),
    capacity: capacity,
    fp: fp,
    count: 0,
  });
};

ScalableBloomFilter.prototype.current = function () {
  return this.layers[this.layers.length - 1];
};

ScalableBloomFilter.prototype.add = function (key) {
  var layer = this.current();
  if (layer.count >= layer.capacity) {
    this.addLayer(layer.capacity * this.growth, layer.fp * this.tightening);
    layer = this.current();
  }
  layer.filter.add(key);
  layer.count += 1;
  this.count += 1;
  return this;
};

ScalableBloomFilter.prototype.has = function (key) {
  for (var i = 0; i < this.layers.length; i++) {
    if (this.layers[i].filter.has(key)) {
      return true;
    }
  }
  return false;
};

ScalableBloomFilter.prototype.fpRate = function () {
  // Union bound across layers: 1 - Π(1 - fp_i).
  var clean = 1;
  this.layers.forEach(function (layer) {
    clean *= 1 - layer.filter.fpRate();
  });
  return 1 - clean;
};

ScalableBloomFilter.prototype.toJSON = function () {
  return {
    scalable: true,
    growth: this.growth,
    tightening: this.tightening,
    layers: this.layers.map(function (layer) {
      return {
        filter: layer.filter.toJSON(),
        capacity: layer.capacity,
        fp: layer.fp,
        count: layer.count,
      };
    }),
  };
};

ScalableBloomFilter.fromJSON = function (data) {
  if (!data || !data.scalable || !Array.isArray(data.layers)) {
    throw new Error("not a serialized scalable bloom filter");
  }
  return new ScalableBloomFilter({
    growth: data.growth,
    tightening: data.tightening,
    layers: data.layers.map(function (entry) {
      return {
        filter: BloomFilter.fromJSON(entry.filter),
        capacity: entry.capacity,
        fp: entry.fp || 0.01,
        count: entry.count || 0,
      };
    }),
  });
};

// Content-dispatched loader: new scalable snapshots AND legacy
// single-filter snapshots both load. Old DBs keep working untouched.
function filterFromJSON(data) {
  if (data && data.scalable) {
    return ScalableBloomFilter.fromJSON(data);
  }
  return BloomFilter.fromJSON(data);
}

module.exports.BloomFilter = BloomFilter;
module.exports.ScalableBloomFilter = ScalableBloomFilter;
module.exports.filterFromJSON = filterFromJSON;
module.exports.optimalBits = optimalBits;
module.exports.optimalHashes = optimalHashes;
