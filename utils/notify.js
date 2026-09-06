"use strict";

// Alert transports: Telegram Bot API, Discord webhooks and generic JSON
// webhooks (Slack incoming-webhook compatible). Credentials always come from
// environment variables, never from CLI flags (flags leak into shell history
// and process listings).

var helper = require("./helper");

var TELEGRAM_BASE = "https://api.telegram.org";
var TELEGRAM_MAX = 3500; // under the 4096 API limit
var DISCORD_BATCH = 10; // max embeds per webhook call

function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(text, max) {
  var out = String(text == null ? "" : text).trim();
  if (out.length <= max) {
    return out;
  }
  var cut = out.slice(0, max - 1).trim();
  // Never split a surrogate pair: a trailing lead surrogate would emit a
  // lone surrogate, which the Telegram API can reject with 400 Bad Request.
  if (/[\uD800-\uDBFF]$/.test(cut)) {
    cut = cut.slice(0, -1);
  }
  return cut + "…";
}

// Scraped/shortened URLs are untrusted: only http(s) may become a link
// target, so javascript:/data: schemes can never reach a chat client.
function safeHttpUrl(value) {
  var out = String(value == null ? "" : value).trim();
  return /^https?:\/\//i.test(out) ? out : null;
}

// item = { title, titleAlt, url, link, summary, deadline: {raw, holiday} |
//          null, weekend, location, archiveUrl, calLink }
function formatTelegramJob(item) {
  var lines = ["🆕 <b>" + escapeHtml(item.title || "(untitled)") + "</b>"];
  if (item.titleAlt) {
    lines.push("🌐 " + escapeHtml(item.titleAlt));
  }
  if (item.summary) {
    lines.push(escapeHtml(truncate(item.summary, 600)));
  }
  if (item.deadline) {
    var dateLine = "📅 Last date: " + escapeHtml(item.deadline.raw);
    if (item.deadline.holiday) {
      dateLine +=
        " — ⚠️ <b>" +
        escapeHtml(item.deadline.holiday) +
        "</b> (public holiday), apply early!";
    } else if (item.weekend) {
      dateLine += " — ⚠️ falls on a weekend, apply early!";
    }
    lines.push(dateLine);
  }
  if (item.location) {
    lines.push("📍 " + escapeHtml(item.location));
  }
  var applyUrl = safeHttpUrl(item.link) || safeHttpUrl(item.url);
  var links = applyUrl
    ? ['🔗 <a href="' + escapeHtml(applyUrl) + '">Apply</a>']
    : ["🔗 (link unavailable)"];
  if (item.calLink) {
    links.push('<a href="' + escapeHtml(item.calLink) + '">⏰ Remind me</a>');
  }
  if (item.archiveUrl) {
    links.push('<a href="' + escapeHtml(item.archiveUrl) + '">🧾 Snapshot</a>');
  }
  lines.push(links.join(" · "));
  return lines.join("\n");
}

function packTelegram(items, maxChars) {
  var limit = maxChars || TELEGRAM_MAX;
  var texts = [];
  var current = "";
  items.forEach(function (item) {
    var block = formatTelegramJob(item);
    var candidate = current ? current + "\n\n────────\n\n" + block : block;
    if (candidate.length > limit && current) {
      texts.push(current);
      current = block;
    } else {
      current = candidate;
    }
  });
  if (current) {
    texts.push(current);
  }
  return texts;
}

async function sendTelegram(client, options) {
  options = options || {};
  var base = options.baseUrl || TELEGRAM_BASE;
  var texts = options.texts || [];
  var sent = 0;
  for (var i = 0; i < texts.length; i++) {
    await client.post(base + "/bot" + options.token + "/sendMessage", {
      chat_id: options.chatId,
      text: texts[i],
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    sent += 1;
    if (i < texts.length - 1) {
      await helper.sleep(350);
    }
  }
  return { sent: sent };
}

function formatDiscordEmbed(item) {
  var lines = [];
  if (item.summary) {
    lines.push(truncate(item.summary, 1500));
  }
  if (item.deadline) {
    var dateLine = "📅 **Last date:** " + item.deadline.raw;
    if (item.deadline.holiday) {
      dateLine +=
        " — ⚠️ **" +
        item.deadline.holiday +
        "** (public holiday), apply early!";
    } else if (item.weekend) {
      dateLine += " — ⚠️ falls on a weekend, apply early!";
    }
    lines.push(dateLine);
  }
  if (item.location) {
    lines.push("📍 " + item.location);
  }
  var applyUrl = safeHttpUrl(item.link) || safeHttpUrl(item.url);
  var links = [
    applyUrl ? "[Apply](" + applyUrl + ")" : "🔗 (link unavailable)",
  ];
  if (item.calLink) {
    links.push("[⏰ Remind me](" + item.calLink + ")");
  }
  if (item.archiveUrl) {
    links.push("[🧾 Snapshot](" + item.archiveUrl + ")");
  }
  lines.push(links.join(" · "));
  return {
    title: "🆕 " + truncate(item.title || "(untitled)", 250),
    url: safeHttpUrl(item.url) || undefined,
    description: lines.join("\n"),
    color: 1753711,
  };
}

async function sendDiscord(client, options) {
  options = options || {};
  var embeds = options.embeds || [];
  var sent = 0;
  for (var i = 0; i < embeds.length; i += DISCORD_BATCH) {
    await client.post(options.webhookUrl, {
      embeds: embeds.slice(i, i + DISCORD_BATCH),
    });
    sent += Math.min(DISCORD_BATCH, embeds.length - i);
    if (i + DISCORD_BATCH < embeds.length) {
      await helper.sleep(500);
    }
  }
  return { sent: sent };
}

function webhookPayload(items) {
  var jobs = items.map(function (item) {
    return {
      title: item.title || null,
      titleAlt: item.titleAlt || null,
      url: item.url || null,
      link: item.link || item.url || null,
      summary: item.summary || null,
      deadline: item.deadline ? item.deadline.raw : null,
      holiday: item.deadline ? item.deadline.holiday || null : null,
      weekend: Boolean(item.weekend),
      location: item.location || null,
      archiveUrl: item.archiveUrl || null,
      calLink: item.calLink || null,
    };
  });
  var text =
    jobs.length === 1
      ? "🆕 1 new Sarkari job: " + (jobs[0].title || jobs[0].url)
      : "🆕 " + jobs.length + " new Sarkari jobs";
  return { text: text, jobs: jobs };
}

async function sendWebhook(client, options) {
  options = options || {};
  await client.post(options.url, options.payload || {});
  return { sent: 1 };
}

module.exports.escapeHtml = escapeHtml;
module.exports.formatTelegramJob = formatTelegramJob;
module.exports.packTelegram = packTelegram;
module.exports.sendTelegram = sendTelegram;
module.exports.formatDiscordEmbed = formatDiscordEmbed;
module.exports.sendDiscord = sendDiscord;
module.exports.webhookPayload = webhookPayload;
module.exports.sendWebhook = sendWebhook;
