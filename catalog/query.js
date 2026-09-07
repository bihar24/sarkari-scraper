"use strict";

var model = require("./model");
var domains = require("./domains");

function parseQuery(params) {
  var result = {};
  [
    "q",
    "kind",
    "category",
    "region",
    "source",
    "freshness",
    "status",
    "persona",
    "namespace",
  ].forEach(function (key) {
    var value = params.get(key);
    if (value && value.length > 200) throw new Error(key + " is too long.");
    if (value) result[key] = value.trim();
  });
  if (result.kind && model.KINDS.indexOf(result.kind) === -1)
    throw new Error("Unknown opportunity kind.");
  ["limit", "offset", "age", "income"].forEach(function (key) {
    if (!params.has(key)) return;
    var value = params.get(key);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw new Error(key + " must be a non-negative integer.");
    result[key] = Number(value);
  });
  if (result.limit !== undefined && (result.limit < 1 || result.limit > 100))
    throw new Error("limit must be between 1 and 100.");
  if (result.offset > 10000 || result.age > 120 || result.income > 1000000000)
    throw new Error("Filter value is out of range.");
  result.limit = result.limit || 24;
  result.offset = result.offset || 0;
  return result;
}

function search(catalogue, filters, now) {
  filters = filters || {};
  var directory = new Set(
    catalogue.directory ? catalogue.directory.domains : []
  );
  var needle = (filters.q || "").toLocaleLowerCase();
  return catalogue.records
    .filter(function (r) {
      if (filters.kind && r.kind !== filters.kind) return false;
      if (filters.category && r.categories.indexOf(filters.category) === -1)
        return false;
      if (filters.region && r.region !== filters.region) return false;
      if (filters.source && r.source.provider !== filters.source) return false;
      if (filters.status && model.displayStatus(r, now) !== filters.status)
        return false;
      if (
        filters.freshness &&
        model.freshness(r, now).state !== filters.freshness
      )
        return false;
      if (
        filters.namespace &&
        domains.classify(r.url, directory).classification !== filters.namespace
      )
        return false;
      if (
        (filters.persona ||
          filters.age !== undefined ||
          filters.income !== undefined) &&
        !model.possibleMatch(r, filters).matches
      )
        return false;
      if (needle) {
        var haystack = [
          r.title.en,
          r.title.hi,
          r.summary.en,
          r.summary.hi,
          r.department && r.department.en,
          r.department && r.department.hi,
          r.categories.join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        if (haystack.indexOf(needle) === -1) return false;
      }
      return true;
    })
    .sort(function (a, b) {
      // Approaching dated opportunities first, then consistently by title.
      var day = (now || new Date()).toISOString().slice(0, 10);
      var ad = a.deadline && a.deadline.date >= day ? a.deadline.date : "9999";
      var bd = b.deadline && b.deadline.date >= day ? b.deadline.date : "9999";
      return ad.localeCompare(bd) || a.title.en.localeCompare(b.title.en);
    });
}

function summary(record, directory, now) {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    summary: {
      en: record.summary.en ? record.summary.en.slice(0, 500) : null,
      hi: record.summary.hi ? record.summary.hi.slice(0, 500) : null,
    },
    categories: record.categories,
    region: record.region,
    url: record.url,
    applyUrl: record.applyUrl,
    status: model.displayStatus(record, now),
    deadline: record.deadline,
    department: record.department,
    benefits: record.benefits,
    source: record.source,
    freshness: model.freshness(record, now),
    domain: domains.classify(record.url, directory),
  };
}

function stats(catalogue, now) {
  var kinds = { job: 0, scheme: 0, policy: 0, paper: 0 };
  var categories = new Set();
  var providers = new Set();
  var needsReview = 0;
  var governmentNamespace = 0;
  catalogue.records.forEach(function (r) {
    kinds[r.kind] += 1;
    r.categories.forEach(function (c) {
      categories.add(c);
    });
    providers.add(r.source.provider);
    if (model.freshness(r, now).state !== "recently_reviewed") needsReview += 1;
    if (domains.namespace(domains.hostname(r.url))) governmentNamespace += 1;
  });
  return {
    total: catalogue.records.length,
    kinds: kinds,
    categories: Array.from(categories).sort(),
    providers: Array.from(providers).sort(),
    needsReview: needsReview,
    governmentNamespace: governmentNamespace,
    directoryDomains: catalogue.directory
      ? catalogue.directory.domains.length
      : 0,
  };
}

module.exports = {
  parseQuery: parseQuery,
  search: search,
  summary: summary,
  stats: stats,
};
