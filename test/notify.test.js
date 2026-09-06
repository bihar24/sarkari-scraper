"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var httpServer = require("node:http");
var http = require("../utils/http");
var notify = require("../utils/notify");

function sampleItem(overrides) {
  return Object.assign(
    {
      title: "Clerk <UPSC>",
      titleAlt: "क्लर्क",
      url: "https://example.test/job/1",
      link: "https://cleanuri.com/abc",
      summary: "100 posts for graduates.",
      deadline: { raw: "15-Aug-2026", holiday: "Independence Day" },
      weekend: false,
      location: "Central Delhi, DELHI",
      archiveUrl: "https://web.archive.org/web/2026/http://x",
      calLink: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    },
    overrides || {}
  );
}

function captureServer() {
  var bodies = [];
  var server = httpServer.createServer(function (req, res) {
    var chunks = [];
    req.on("data", function (chunk) {
      chunks.push(chunk);
    });
    req.on("end", function () {
      bodies.push({
        url: req.url,
        json: JSON.parse(Buffer.concat(chunks).toString() || "{}"),
      });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
  });
  return {
    bodies: bodies,
    start: function () {
      return new Promise(function (resolve) {
        server.listen(0, "127.0.0.1", function () {
          resolve("http://127.0.0.1:" + server.address().port);
        });
      });
    },
    stop: function () {
      server.close();
    },
  };
}

describe("notify formatting", function () {
  it("formats Telegram HTML with escaping and holiday warnings", function () {
    var text = notify.formatTelegramJob(sampleItem());
    assert.match(text, /Clerk &lt;UPSC&gt;/);
    assert.match(text, /क्लर्क/);
    assert.match(text, /Independence Day/);
    assert.match(text, /public holiday/);
    assert.match(text, /Central Delhi/);
    assert.match(text, /Remind me/);
    assert.match(text, /Snapshot/);
  });

  it("notes weekend deadlines when no holiday applies", function () {
    var text = notify.formatTelegramJob(
      sampleItem({
        deadline: { raw: "16-Aug-2026", holiday: null },
        weekend: true,
      })
    );
    assert.match(text, /weekend/);
  });

  it("packs many jobs into size-capped messages", function () {
    var items = [];
    for (var i = 0; i < 10; i++) {
      items.push(sampleItem({ title: "Job number " + i }));
    }
    var texts = notify.packTelegram(items, 800);
    assert.ok(texts.length > 1);
    texts.forEach(function (text) {
      assert.ok(text.length <= 800 + 600); // single job may exceed tiny caps
    });
    assert.match(texts.join("\n"), /Job number 9/);
  });

  it("formats Discord embeds and webhook payloads", function () {
    var embed = notify.formatDiscordEmbed(sampleItem());
    assert.match(embed.title, /Clerk/);
    assert.equal(embed.url, "https://example.test/job/1");
    assert.match(embed.description, /Independence Day/);
    var payload = notify.webhookPayload([sampleItem()]);
    assert.match(payload.text, /1 new Sarkari job/);
    assert.equal(payload.jobs[0].holiday, "Independence Day");
  });
});

describe("notify transports (stub server)", function () {
  it("sends Telegram, Discord batches and webhooks", async function () {
    var srv = captureServer();
    var base = await srv.start();
    try {
      var client = http.createClient({ timeoutMs: 5000 });

      var telegram = await notify.sendTelegram(client, {
        token: "TESTTOKEN",
        chatId: "123",
        texts: ["one", "two"],
        baseUrl: base,
      });
      assert.equal(telegram.sent, 2);
      assert.equal(srv.bodies[0].url, "/botTESTTOKEN/sendMessage");
      assert.equal(srv.bodies[0].json.chat_id, "123");
      assert.equal(srv.bodies[0].json.parse_mode, "HTML");

      var embeds = [];
      for (var i = 0; i < 25; i++) {
        embeds.push({ title: "e" + i });
      }
      var discord = await notify.sendDiscord(client, {
        webhookUrl: base + "/discord-hook",
        embeds: embeds,
      });
      assert.equal(discord.sent, 25);
      assert.equal(srv.bodies.length, 2 + 3); // telegram x2 + discord x3
      assert.equal(srv.bodies[2].json.embeds.length, 10);
      assert.equal(srv.bodies[4].json.embeds.length, 5);

      var hook = await notify.sendWebhook(client, {
        url: base + "/hook",
        payload: { text: "hi" },
      });
      assert.equal(hook.sent, 1);
      assert.equal(srv.bodies[5].json.text, "hi");
    } finally {
      srv.stop();
    }
  });
});
