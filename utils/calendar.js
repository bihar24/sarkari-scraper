"use strict";

// Deadline parsing + calendar outputs (Google Calendar links, ICS files).
// Sarkari postings use inconsistent date formats, so parsing is strict and
// best-effort: unparseable dates return null instead of guessing.

var MONTHS = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function validDate(year, month, day) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  if (year < 2000 || year > 2100 || month < 0 || month > 11) {
    return null;
  }
  var date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null; // e.g. 30-Feb rolled over
  }
  return date;
}

function monthIndex(name) {
  var key = String(name).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(MONTHS, key)) {
    return MONTHS[key];
  }
  return null;
}

// Tries DD-MMM-YYYY, DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, "DD Month YYYY".
function parseDeadline(text) {
  if (typeof text !== "string") {
    return null;
  }
  var cleaned = text.trim().replace(/\s+/g, " ");
  var match;

  match = /^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{4})$/.exec(cleaned);
  if (match) {
    var month = monthIndex(match[2]);
    if (month !== null) {
      return validDate(Number(match[3]), month, Number(match[1]));
    }
    return null;
  }

  match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(cleaned);
  if (match) {
    return validDate(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cleaned);
  if (match) {
    return validDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  return null;
}

function daystamp(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function googleCalLink(options) {
  options = options || {};
  var start = daystamp(options.date);
  var end = daystamp(new Date(options.date.getTime() + 24 * 3600 * 1000));
  var params = [
    "action=TEMPLATE",
    "text=" + encodeURIComponent(options.title || "Application deadline"),
    "dates=" + start + "/" + end,
  ];
  if (options.details) {
    params.push("details=" + encodeURIComponent(options.details));
  }
  return "https://calendar.google.com/calendar/render?" + params.join("&");
}

function escapeIcs(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
    .slice(0, 2000);
}

function buildIcs(events) {
  var stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//bihar24//sarkari-scraper//EN",
    "CALSCALE:GREGORIAN",
  ];
  events.forEach(function (event, index) {
    if (
      !event ||
      !(event.date instanceof Date) ||
      Number.isNaN(event.date.getTime())
    ) {
      return; // never let one bad event poison the calendar (or throw)
    }
    lines.push(
      "BEGIN:VEVENT",
      "UID:" +
        (event.uid || "sarkari-" + Date.now() + "-" + index) +
        "@sarkari-scraper",
      "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + daystamp(event.date),
      "SUMMARY:" + escapeIcs(event.title || "Application deadline")
    );
    if (event.description) {
      lines.push("DESCRIPTION:" + escapeIcs(event.description));
    }
    if (event.url) {
      lines.push("URL:" + escapeIcs(event.url));
    }
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function isWeekend(date) {
  var day = date.getUTCDay();
  return day === 0 || day === 6;
}

module.exports.parseDeadline = parseDeadline;
module.exports.googleCalLink = googleCalLink;
module.exports.buildIcs = buildIcs;
module.exports.isWeekend = isWeekend;
