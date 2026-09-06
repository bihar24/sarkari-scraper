"use strict";

// Red-team regression suite: output-encoding, untrusted URLs, archive scale
// and retention. Each test pins a finding from the 1.8.0 hardening review.

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var csv = require("../utils/csv");
var rss = require("../utils/rss");
var calendar = require("../utils/calendar");
var notify = require("../utils/notify");
var bloom = require("../utils/bloom");
var notifydb = require("../utils/notifydb");
var initSqlJs = require("sql.js");

describe("hardening: CSV formula injection", function () {
  it("neutralizes spreadsheet formula prefixes", function () {
    assert.equal(
      csv.sanitizeCell('=HYPERLINK("http://evil")'),
      '\'=HYPERLINK("http://evil")'
    );
    assert.equal(csv.sanitizeCell("+1+1"), "'+1+1");
    assert.equal(csv.sanitizeCell("-2+3"), "'-2+3");
    assert.equal(csv.sanitizeCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csv.sanitizeCell("  =cmd"), "'  =cmd");
    assert.equal(csv.sanitizeCell("Clerk (100 posts)"), "Clerk (100 posts)");
    assert.equal(csv.sanitizeCell("2+2=4"), "2+2=4");
    assert.equal(csv.sanitizeCell(42), 42);
  });

  it("sanitizes end to end through parse()", function () {
    var out = csv.parse([{ title: "=1+1", link: "https://x.test/a" }]);
    assert.ok(out.indexOf("'=1+1") !== -1);
  });
});

describe("hardening: XML control characters", function () {
  it("strips chars forbidden by XML 1.0", function () {
    assert.equal(rss.escapeXml("a\x00b\x01c\x1fd\x7fe"), "abcde");
    assert.equal(rss.escapeXml("tab\tLF\nCR\rkept"), "tab\tLF\nCR\rkept");
    var feed = rss.buildRss({
      items: [{ title: "x\x00y", link: "https://x.test/" }],
    });
    assert.ok(feed.indexOf("\x00") === -1);
    assert.ok(feed.indexOf("<title>xy</title>") !== -1);
  });
});

describe("hardening: ICS bad events", function () {
  it("skips invalid dates instead of throwing", function () {
    var ics = calendar.buildIcs([
      { uid: "bad", title: "Bad", date: new Date("nope") },
      { uid: "good", title: "Good", date: new Date(Date.UTC(2026, 8, 15)) },
    ]);
    assert.ok(ics.indexOf("SUMMARY:Good") !== -1);
    assert.ok(ics.indexOf("SUMMARY:Bad") === -1);
  });
});

describe("hardening: Telegram/Discord output", function () {
  it("escapes quotes so hrefs cannot break out", function () {
    assert.equal(notify.escapeHtml('a"b'), "a&quot;b");
    var text = notify.formatTelegramJob({
      title: 'Clerk "Special" <tag>',
      url: "https://x.test/a",
    });
    assert.ok(text.indexOf("&quot;Special&quot;") !== -1);
    assert.ok(text.indexOf("&lt;tag&gt;") !== -1);
    assert.ok(text.indexOf('"Special"') === -1);
  });

  it("never splits surrogate pairs when truncating", function () {
    var embed = notify.formatDiscordEmbed({
      title: "a😀b",
      url: "https://x.test/a",
    });
    assert.ok(embed.title.length <= 253);
    var job = notify.formatTelegramJob({
      title: "ok",
      summary: "a😀b",
      url: "https://x.test/a",
    });
    for (var i = 0; i < job.length; i++) {
      var code = job.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        var next = job.charCodeAt(i + 1);
        assert.ok(next >= 0xdc00 && next <= 0xdfff);
        i += 1;
      } else {
        assert.ok(code < 0xdc00 || code > 0xdfff);
      }
    }
  });

  it("refuses non-http(s) link targets", function () {
    var fallback = notify.formatTelegramJob({
      title: "t",
      link: "javascript:alert(1)",
      url: "https://ok.test/x",
    });
    assert.ok(fallback.indexOf("https://ok.test/x") !== -1);
    assert.ok(fallback.indexOf("javascript:") === -1);
    var none = notify.formatTelegramJob({
      title: "t",
      link: "javascript:alert(1)",
      url: "data:text/html,hi",
    });
    assert.ok(none.indexOf("(link unavailable)") !== -1);
    var dembed = notify.formatDiscordEmbed({
      title: "t",
      link: "javascript:alert(1)",
      url: "data:text/html,hi",
    });
    assert.equal(dembed.url, undefined);
    assert.ok(dembed.description.indexOf("(link unavailable)") !== -1);
  });
});

describe("hardening: scalable bloom filter", function () {
  it("grows layers with no false negatives", function () {
    var filter = new bloom.ScalableBloomFilter({ capacity: 100, fpRate: 0.01 });
    var i;
    for (i = 0; i < 250; i++) {
      filter.add("https://site.test/grow/" + i);
    }
    assert.equal(filter.layers.length, 2);
    assert.equal(filter.count, 250);
    for (i = 0; i < 250; i++) {
      assert.equal(filter.has("https://site.test/grow/" + i), true);
    }
    assert.ok(filter.fpRate() < 0.15);
  });

  it("round-trips and stays backward compatible", function () {
    var filter = new bloom.ScalableBloomFilter({ capacity: 10 });
    filter.add("a");
    filter.add("b");
    var revived = bloom.filterFromJSON(JSON.parse(JSON.stringify(filter)));
    assert.equal(revived.has("a"), true);
    assert.equal(revived.has("b"), true);
    assert.equal(revived.count, 2);
    var legacy = new bloom.BloomFilter({ items: 100 });
    legacy.add("old");
    var loaded = bloom.filterFromJSON(JSON.parse(JSON.stringify(legacy)));
    assert.equal(loaded.layers, undefined);
    assert.equal(loaded.has("old"), true);
  });
});

describe("hardening: archive batch writes and retention", function () {
  function tempDb() {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "harden-"));
    return { dir: dir, file: path.join(dir, "n.db") };
  }

  it("recordMany persists a batch with one flush", async function () {
    var tmp = tempDb();
    try {
      var db = await notifydb.openNotifyDb(tmp.file);
      db.recordMany([
        { url: "https://site.test/1", title: "One" },
        { url: "https://site.test/2", title: "Two" },
        { url: "https://site.test/3", title: "Three" },
      ]);
      assert.equal(db.stats().count, 3);
      assert.equal(db.stats().bloom.count, 3);
      db.close();
      var reopened = await notifydb.openNotifyDb(tmp.file);
      assert.equal(reopened.notified("https://site.test/2"), true);
      reopened.close();
    } finally {
      fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
  });

  it("prune forgets old rows while bloom bits stay harmless", async function () {
    var tmp = tempDb();
    try {
      var db = await notifydb.openNotifyDb(tmp.file);
      db.record({ url: "https://site.test/old", title: "Old" });
      assert.equal(db.prune(36500), 0);
      assert.equal(db.prune(0), 1); // cutoff "now": everything older
      assert.equal(db.stats().count, 0);
      assert.equal(db.notified("https://site.test/old"), false); // re-alerts
      assert.equal(db.stats().bloom.count, 1); // stale bits kept, exact table rules
      db.close();
    } finally {
      fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
  });

  it("rebuilds a corrupt bloom filter from the exact table", async function () {
    var tmp = tempDb();
    try {
      var db = await notifydb.openNotifyDb(tmp.file);
      db.record({ url: "https://site.test/k", title: "K" });
      db.close();
      var SQL = await initSqlJs();
      var raw = new SQL.Database(fs.readFileSync(tmp.file));
      raw.run("UPDATE meta SET value = 'garbage' WHERE key = 'bloom'");
      fs.writeFileSync(tmp.file, Buffer.from(raw.export()));
      raw.close();
      var rebuilt = await notifydb.openNotifyDb(tmp.file);
      assert.equal(rebuilt.notified("https://site.test/k"), true);
      assert.equal(rebuilt.notified("https://site.test/other"), false);
      rebuilt.close();
    } finally {
      fs.rmSync(tmp.dir, { recursive: true, force: true });
    }
  });
});
