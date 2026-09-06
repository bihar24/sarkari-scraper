"use strict";

var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var calendar = require("../utils/calendar");

describe("calendar.parseDeadline", function () {
  it("parses common Sarkari date formats", function () {
    assert.equal(
      calendar.parseDeadline("01-Jan-2026").toISOString().slice(0, 10),
      "2026-01-01"
    );
    assert.equal(
      calendar.parseDeadline("5 February 2026").toISOString().slice(0, 10),
      "2026-02-05"
    );
    assert.equal(
      calendar.parseDeadline("15/08/2026").toISOString().slice(0, 10),
      "2026-08-15"
    );
    assert.equal(
      calendar.parseDeadline("15-08-2026").toISOString().slice(0, 10),
      "2026-08-15"
    );
    assert.equal(
      calendar.parseDeadline("2026-12-31").toISOString().slice(0, 10),
      "2026-12-31"
    );
  });

  it("rejects invalid and ambiguous input instead of guessing", function () {
    assert.equal(calendar.parseDeadline("30-Feb-2026"), null);
    assert.equal(calendar.parseDeadline("2026-13-01"), null);
    assert.equal(calendar.parseDeadline("soon"), null);
    assert.equal(calendar.parseDeadline(""), null);
    assert.equal(calendar.parseDeadline(null), null);
    assert.equal(calendar.parseDeadline("15/08/26"), null);
  });

  it("detects weekends", function () {
    assert.equal(calendar.isWeekend(new Date(Date.UTC(2026, 0, 3))), true); // Sat
    assert.equal(calendar.isWeekend(new Date(Date.UTC(2026, 0, 5))), false); // Mon
  });
});

describe("calendar outputs", function () {
  it("builds Google Calendar template links", function () {
    var link = calendar.googleCalLink({
      title: "UPSC Clerk — apply by",
      date: new Date(Date.UTC(2026, 7, 15)),
      details: "https://example.test/job",
    });
    assert.match(link, /calendar\.google\.com\/calendar\/render\?/);
    assert.match(link, /dates=20260815\/20260816/);
    assert.match(link, /text=UPSC%20Clerk/);
  });

  it("builds a valid-ish ICS calendar", function () {
    var ics = calendar.buildIcs([
      {
        uid: "job-1",
        title: "Clerk, last date",
        date: new Date(Date.UTC(2026, 7, 15)),
        description: "Apply at https://example.test/job",
        url: "https://example.test/job",
      },
    ]);
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /BEGIN:VEVENT/);
    assert.match(ics, /UID:job-1@sarkari-scraper/);
    assert.match(ics, /DTSTART;VALUE=DATE:20260815/);
    assert.match(ics, /SUMMARY:Clerk\\, last date/);
    assert.match(ics, /END:VCALENDAR/);
  });
});
