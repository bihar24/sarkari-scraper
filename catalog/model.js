"use strict";

var crypto = require("node:crypto");
var calendar = require("../utils/calendar");
var digest = require("../utils/digest");

var VERSION = 1;
var KINDS = ["job", "scheme", "policy", "paper"];
var TRACKER_REPO = "https://github.com/fossdot/bihar-scheme-tracker";
var TRACKER_CREDIT = "Bihar Policy & Scheme Tracker by Vishal Arya / Bodhya";
var CC_LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/";

function text(value, max) {
  if (typeof value !== "string") return null;
  return (
    value
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max || 20000) || null
  );
}

function url(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    var parsed = new URL(value);
    if (
      !/^https?:$/.test(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return null;
    return parsed.toString();
  } catch (err) {
    return null;
  }
}

function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  return calendar.parseDeadline(value) ? value : null;
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, 24);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  var result = {};
  Object.keys(value)
    .sort()
    .forEach(function (key) {
      Object.defineProperty(result, key, {
        value: stable(value[key]),
        enumerable: true,
      });
    });
  return result;
}

function fingerprint(record) {
  var copy = Object.assign({}, record, {
    source: Object.assign({}, record.source),
  });
  delete copy.source.fetchedAt;
  // Updating a Git revision does not mean every record's content changed.
  delete copy.source.revision;
  delete copy.source.recordUrl;
  return hash(JSON.stringify(stable(copy)));
}

function strings(value) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map(function (v) {
              return text(v, 120);
            })
            .filter(Boolean)
        )
      ).slice(0, 50)
    : [];
}

function bilingual(en, hi) {
  return { en: text(en), hi: text(hi) };
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function source(options, originalUrl) {
  return {
    provider: options.provider,
    url: originalUrl,
    recordUrl: url(options.recordUrl) || originalUrl,
    revision: options.revision || null,
    fetchedAt: options.fetchedAt || new Date().toISOString(),
    lastVerified: null,
    license: null,
    attribution: null,
  };
}

function normalizeTracker(raw, options) {
  options = options || {};
  var kind = options.kind;
  if (["scheme", "policy"].indexOf(kind) === -1)
    throw new Error("Expected scheme or policy.");
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Expected a YAML record object.");
  if (!text(raw.name_en) || !url(raw.source_url) || !date(raw.last_verified)) {
    throw new Error(
      "Tracker record needs name_en, a valid source_url, and last_verified (YYYY-MM-DD)."
    );
  }
  if (kind === "scheme" && (!text(raw.status_evidence) || !text(raw.status))) {
    throw new Error("Scheme status must carry upstream status_evidence.");
  }
  var origin = source(
    {
      provider: "bihar-scheme-tracker",
      fetchedAt: options.fetchedAt,
      recordUrl: options.recordUrl,
      revision: options.revision,
    },
    url(raw.source_url)
  );
  origin.lastVerified = raw.last_verified;
  origin.license = "CC-BY-SA-4.0";
  origin.attribution = {
    name: TRACKER_CREDIT,
    url: "https://yojana.bodhya.net",
    licenseUrl: CC_LICENSE,
    changes:
      "Imported and normalized into the Sarkari catalogue; upstream evidence and original fields retained.",
  };
  return {
    schemaVersion: VERSION,
    id: kind + ":tracker:" + (options.slug || hash(raw.name_en)),
    kind: kind,
    title: bilingual(raw.name_en, raw.name_hi),
    summary: bilingual(
      raw.objective_en || raw.summary_en,
      raw.objective_hi || raw.summary_hi
    ),
    categories: strings(raw.categories),
    region: raw.domicile === "any" ? "india" : "bihar",
    url: origin.url,
    applyUrl: url(raw.application_portal_url),
    // This is a SOURCE assertion, not our independently verified status.
    status: kind === "scheme" ? text(raw.status, 80) : "unverified",
    evidence: kind === "scheme" ? text(raw.status_evidence) : null,
    deadline:
      kind === "policy" && date(raw.consultation_end)
        ? {
            date: raw.consultation_end,
            raw: raw.consultation_end,
            purpose: "consultation",
          }
        : null,
    department: bilingual(raw.department_en, raw.department_hi),
    benefits: bilingual(raw.benefit_detail, raw.benefit_detail_hi),
    eligibility: {
      text: bilingual(raw.eligibility_en, raw.eligibility_hi),
      personas: strings(raw.personas),
      education: strings(raw.education_levels),
      socialCategories: strings(raw.social_categories),
      gender: text(raw.gender_eligibility, 40),
      minAge: number(raw.min_age),
      maxAge: number(raw.max_age),
      incomeCeiling: number(raw.income_ceiling),
      domicile: text(raw.domicile, 40),
      requiresBpl:
        typeof raw.requires_bpl === "boolean" ? raw.requires_bpl : null,
      disabilityOnly:
        typeof raw.is_for_disabled === "boolean" ? raw.is_for_disabled : null,
    },
    links: [
      { label: "Application portal", url: url(raw.application_portal_url) },
      { label: "Policy document", url: url(raw.document_url) },
      { label: "Consultation", url: url(raw.consultation_url) },
    ].filter(function (link) {
      return link.url;
    }),
    source: origin,
    // Retain budgets, RTI provenance, missing values and evidence verbatim.
    // This data is CC BY-SA, separately from this original MIT adapter.
    original: raw,
  };
}

function collectLinks(records) {
  var links = [];
  var seen = new Set();
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    var target = url(value.link);
    if (target && !seen.has(target)) {
      seen.add(target);
      links.push({
        label: text(value.text, 500) || "Source document",
        url: target,
      });
    }
    if (value.value) visit(value.value);
  }
  visit(records);
  return links.slice(0, 200);
}

function normalizeScraped(raw, options) {
  options = options || {};
  var kind = options.kind || "job";
  if (["job", "paper"].indexOf(kind) === -1)
    throw new Error("Expected job or paper.");
  if (!raw || raw.error)
    throw new Error("Failed scrape record; previous data retained.");
  var originalUrl = url(raw.url || raw.link);
  if (!originalUrl) throw new Error("Scraped record has no valid HTTP(S) URL.");
  var detail = Array.isArray(raw.detail) ? raw.detail : null;
  if (
    detail &&
    (detail.length > 500 ||
      detail.some(function (r) {
        return !r || typeof r !== "object" || Array.isArray(r);
      }))
  ) {
    throw new Error("Malformed or oversized detail record array.");
  }
  if (
    detail &&
    !detail.some(function (r) {
      return (
        r &&
        r.key !== "Post Link" &&
        (text(r.value) || (Array.isArray(r.value) && r.value.length))
      );
    })
  ) {
    throw new Error("Detail contains only a source link; parser needs review.");
  }
  var title = detail
    ? digest.extractTitle(raw)
    : raw.postName || raw.title || raw.exam || raw.company;
  if (!text(title)) throw new Error("Scraped record has no title.");
  var found = detail
    ? digest.extractDeadline(raw)
    : raw.lastDate
      ? { raw: raw.lastDate, parsed: calendar.parseDeadline(raw.lastDate) }
      : null;
  var origin = source(
    {
      provider:
        "scraper:" + new URL(originalUrl).hostname.replace(/^www\./, ""),
      fetchedAt: options.fetchedAt,
    },
    originalUrl
  );
  return {
    schemaVersion: VERSION,
    id:
      kind +
      ":" +
      hash(originalUrl + (kind === "paper" ? ":" + (raw.exam || title) : "")),
    kind: kind,
    title: bilingual(title, null),
    summary: bilingual(
      detail ? digest.extractText(raw) : raw.education || null,
      null
    ),
    categories: [kind === "paper" ? "education" : "employment"],
    region: /bihar/i.test(raw.location || "") ? "bihar" : null,
    url: originalUrl,
    applyUrl: null,
    status: "unverified",
    evidence: null,
    deadline: found
      ? {
          date: found.parsed ? found.parsed.toISOString().slice(0, 10) : null,
          raw: text(found.raw),
          purpose: "application",
        }
      : null,
    department: bilingual(raw.company, null),
    benefits: bilingual(null, null),
    eligibility: null,
    links: detail ? collectLinks(detail) : [],
    source: origin,
    original: raw,
  };
}

function displayStatus(record, now) {
  var today = (now || new Date()).toISOString().slice(0, 10);
  if (record.kind === "policy") {
    var raw = record.original || {};
    if (raw.successor_policy || raw.superseded_by) return "superseded";
    if (raw.is_draft)
      return record.deadline && record.deadline.date >= today
        ? "consultation_open"
        : "draft";
    if (date(raw.period_start) && raw.period_start > today) return "upcoming";
    if (date(raw.period_end) && raw.period_end < today) return "period_ended";
    // A date window alone is not evidence of current implementation.
    return "unverified";
  }
  if (
    record.kind === "job" &&
    record.deadline &&
    record.deadline.date &&
    record.deadline.date < today
  )
    return "deadline_passed";
  return record.status;
}

function freshness(record, now) {
  var stamp = date(record.source.lastVerified);
  if (!stamp) return { state: "unverified", ageDays: null };
  var age = Math.floor(
    ((now || new Date()).getTime() - new Date(stamp + "T00:00:00Z").getTime()) /
      86400000
  );
  return {
    state:
      age < 0
        ? "invalid_date"
        : age > 90
          ? "needs_review"
          : "recently_reviewed",
    ageDays: age,
  };
}

function possibleMatch(record, profile) {
  var e = record.eligibility;
  if (!e) return { matches: true, assessment: "unknown" };
  var excluded =
    (profile.persona &&
      e.personas.length &&
      e.personas.indexOf(profile.persona) === -1) ||
    (profile.age !== undefined &&
      ((e.minAge !== null && profile.age < e.minAge) ||
        (e.maxAge !== null && profile.age > e.maxAge))) ||
    (profile.income !== undefined &&
      e.incomeCeiling !== null &&
      profile.income > e.incomeCeiling);
  return {
    matches: !excluded,
    assessment: excluded
      ? "outside_recorded_criteria"
      : "possible_match_not_eligibility_confirmation",
  };
}

module.exports = {
  VERSION: VERSION,
  KINDS: KINDS,
  TRACKER_REPO: TRACKER_REPO,
  TRACKER_CREDIT: TRACKER_CREDIT,
  text: text,
  url: url,
  date: date,
  hash: hash,
  fingerprint: fingerprint,
  normalizeTracker: normalizeTracker,
  normalizeScraped: normalizeScraped,
  displayStatus: displayStatus,
  freshness: freshness,
  possibleMatch: possibleMatch,
};
