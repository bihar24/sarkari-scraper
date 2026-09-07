"use strict";

// Read-only HTTP boundary. No URLs, commands, file paths or imports supplied
// by a browser ever result in an outbound request or a filesystem write.
var fs = require("node:fs");
var path = require("node:path");
var net = require("node:http");
var store = require("./store");
var query = require("./query");
var model = require("./model");
var domains = require("./domains");
var sources = require("../utils/sources");
var csv = require("../utils/csv");
var rss = require("../utils/rss");
var calendar = require("../utils/calendar");

var STATIC = {
  "/fonts/inter-400.woff2": ["fonts/inter-400.woff2", "font/woff2"],
  "/fonts/inter-600.woff2": ["fonts/inter-600.woff2", "font/woff2"],
  "/fonts/devanagari-400.woff2": ["fonts/devanagari-400.woff2", "font/woff2"],
  "/fonts/devanagari-600.woff2": ["fonts/devanagari-600.woff2", "font/woff2"],
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/favicon.svg": ["favicon.svg", "image/svg+xml"],
  "/robots.txt": ["robots.txt", "text/plain; charset=utf-8"],
  "/sitemap.xml": ["sitemap.xml", "application/xml; charset=utf-8"],
  "/site.webmanifest": [
    "site.webmanifest",
    "application/manifest+json; charset=utf-8",
  ],
  "/social-card.png": ["social-card.png", "image/png"],
};

function createRequestHandler(options) {
  options = options || {};
  var snapshot = options.catalogue
    ? store.validate(options.catalogue)
    : store.empty();
  var signature = null;
  var readError = null;
  var webRoot = path.join(__dirname, "../web");
  var publicUrl =
    model.url(options.publicUrl) ||
    "https://github.com/bihar24/sarkari-scraper";

  function current() {
    if (!options.file) return snapshot;
    try {
      var stat = fs.existsSync(options.file) ? fs.statSync(options.file) : null;
      var next = stat
        ? stat.mtimeMs + ":" + stat.size + ":" + stat.ino
        : "missing";
      if (signature !== next) {
        // A malformed replacement never evicts the in-memory good snapshot.
        var loaded = store.load(options.file);
        snapshot = loaded;
        signature = next;
      }
      readError = null;
    } catch (error) {
      readError =
        "Catalogue could not be reloaded. Serving the last valid snapshot.";
    }
    return snapshot;
  }

  return function requestHandler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'"
    );
    // Intentionally no X-Frame-Options/frame-ancestors restriction: the
    // Arena live preview embeds this read-only application.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    function send(status, body, type) {
      res.statusCode = status;
      res.setHeader("Content-Type", type || "application/json; charset=utf-8");
      res.setHeader(
        "Cache-Control",
        status === 200 ? "public, max-age=30" : "no-store"
      );
      res.end(
        req.method === "HEAD"
          ? undefined
          : typeof body === "string" || Buffer.isBuffer(body)
            ? body
            : JSON.stringify(body)
      );
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD, OPTIONS");
      send(405, {
        error: "This service is read-only. Run imports from the CLI.",
      });
      return;
    }
    var target;
    try {
      target = new URL(req.url, "http://catalogue.invalid");
    } catch (err) {
      send(400, { error: "Invalid URL." });
      return;
    }
    if (target.pathname.startsWith("/api/")) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    try {
      if (Object.prototype.hasOwnProperty.call(STATIC, target.pathname)) {
        var asset = STATIC[target.pathname];
        send(200, fs.readFileSync(path.join(webRoot, asset[0])), asset[1]);
        return;
      }
      var catalogue = current();
      var directory = new Set(
        catalogue.directory ? catalogue.directory.domains : []
      );
      if (target.pathname === "/rss.xml") {
        res.setHeader("Location", "/feed.xml");
        send(308, "", "text/plain; charset=utf-8");
      } else if (target.pathname === "/feed.xml") {
        send(
          200,
          buildFeed(
            query
              .search(catalogue, query.parseQuery(target.searchParams))
              .slice(0, 1000),
            publicUrl,
            catalogue.updatedAt
          ),
          "application/rss+xml; charset=utf-8"
        );
      } else if (target.pathname === "/health") {
        var ready = catalogue.records.length > 0;
        send(readError ? 503 : 200, {
          status: readError ? "degraded" : ready ? "ok" : "degraded",
          ready: ready,
          demo: catalogue.demo,
          updatedAt: catalogue.updatedAt,
          catalogue: {
            ready: ready,
            total: catalogue.records.length,
            kinds: query.stats(catalogue).kinds,
          },
          error: readError,
        });
      } else if (target.pathname === "/api/v1") {
        send(200, {
          name: "Bihar24 RSS · Sarkari Explorer",
          version: "v1",
          schemaVersion: model.VERSION,
          readOnly: true,
          demo: catalogue.demo,
          updatedAt: catalogue.updatedAt,
          endpoints: {
            opportunities: "/api/v1/opportunities",
            detail: "/api/v1/opportunities/{id}",
            sources: "/api/v1/sources",
            domains: "/api/v1/domains",
            changes: "/api/v1/changes",
            export: "/api/v1/export?format=json",
          },
          filters: [
            "q",
            "kind",
            "category",
            "region",
            "source",
            "freshness",
            "status",
            "persona",
            "age",
            "income",
            "namespace",
            "limit",
            "offset",
          ],
          stats: query.stats(catalogue),
          notice:
            "Community-compiled information, not an official government service or eligibility decision. Source verification dates are never replaced by import dates.",
          error: readError,
        });
      } else if (target.pathname === "/api/v1/opportunities") {
        var filters = query.parseQuery(target.searchParams);
        var matches = query.search(catalogue, filters);
        send(200, {
          schemaVersion: model.VERSION,
          total: matches.length,
          limit: filters.limit,
          offset: filters.offset,
          demo: catalogue.demo,
          results: matches
            .slice(filters.offset, filters.offset + filters.limit)
            .map(function (r) {
              return query.summary(r, directory);
            }),
        });
      } else if (target.pathname.startsWith("/api/v1/opportunities/")) {
        var id = decodeURIComponent(
          target.pathname.slice("/api/v1/opportunities/".length)
        );
        var record = catalogue.records.find(function (r) {
          return r.id === id;
        });
        if (!record) {
          send(404, { error: "Opportunity not found." });
          return;
        }
        send(
          200,
          Object.assign({}, record, {
            status: model.displayStatus(record),
            freshness: model.freshness(record),
            domain: domains.classify(record.url, directory),
            demo: catalogue.demo,
          })
        );
      } else if (target.pathname === "/api/v1/sources") {
        send(200, {
          imports: Object.entries(catalogue.sources).map(function (pair) {
            return Object.assign({ id: pair[0] }, pair[1]);
          }),
          scrapers: sources.catalogRows(),
          directory: catalogue.directory
            ? {
                sourceUrl: catalogue.directory.sourceUrl,
                importedAt: catalogue.directory.importedAt,
                revision: catalogue.directory.revision,
                count: catalogue.directory.domains.length,
                license: catalogue.directory.license,
                notice: catalogue.directory.notice,
              }
            : null,
          error: readError,
        });
      } else if (target.pathname === "/api/v1/domains") {
        var domainFilters = query.parseQuery(target.searchParams);
        var listed = Array.from(directory).filter(function (host) {
          return (
            !domainFilters.q || host.includes(domainFilters.q.toLowerCase())
          );
        });
        send(200, {
          total: listed.length,
          limit: domainFilters.limit,
          offset: domainFilters.offset,
          notice:
            "Historical discovery directory, not an official registry or crawl allowlist.",
          results: listed
            .slice(
              domainFilters.offset,
              domainFilters.offset + domainFilters.limit
            )
            .map(function (host) {
              return domains.classify(host, directory);
            }),
        });
      } else if (target.pathname === "/api/v1/changes") {
        send(200, {
          results: catalogue.changes,
          notice:
            "Changes describe imported records, not independently verified government announcements.",
        });
      } else if (target.pathname === "/api/v1/export") {
        var format = target.searchParams.get("format") || "json";
        var exported = query.search(
          catalogue,
          query.parseQuery(target.searchParams)
        );
        if (exported.length > 1000) {
          send(400, {
            error: "Exports are limited to 1,000 records. Narrow your filters.",
          });
          return;
        }
        if (["json", "csv", "rss", "ics"].indexOf(format) === -1) {
          send(400, { error: "Use json, csv, rss or ics." });
          return;
        }
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="sarkari-catalogue.' +
            (format === "rss" ? "xml" : format) +
            '"'
        );
        if (format === "json") {
          send(200, {
            schemaVersion: model.VERSION,
            demo: catalogue.demo,
            exportedAt: new Date().toISOString(),
            notice:
              "Per-record licences and attribution apply; imported tracker material is CC BY-SA 4.0, not MIT.",
            records: exported,
          });
        } else if (format === "csv") {
          send(
            200,
            csv.parse(
              exported.map(function (r) {
                return {
                  id: r.id,
                  kind: r.kind,
                  title_en: r.title.en,
                  title_hi: r.title.hi,
                  url: r.url,
                  status: model.displayStatus(r),
                  source_url: r.source.recordUrl,
                  last_verified: r.source.lastVerified,
                  licence: r.source.license,
                  attribution: r.source.attribution
                    ? r.source.attribution.name +
                      " " +
                      r.source.attribution.url +
                      " " +
                      r.source.attribution.licenseUrl +
                      " " +
                      r.source.attribution.changes
                    : null,
                };
              })
            ),
            "text/csv; charset=utf-8"
          );
        } else if (format === "rss") {
          send(
            200,
            buildFeed(exported, publicUrl, catalogue.updatedAt),
            "application/rss+xml; charset=utf-8"
          );
        } else {
          send(
            200,
            calendar.buildIcs(
              exported
                .filter(function (r) {
                  return r.deadline && r.deadline.date;
                })
                .map(function (r) {
                  return {
                    uid: model.hash(r.id),
                    title: r.title.en + " — " + r.deadline.purpose,
                    date: new Date(r.deadline.date + "T00:00:00Z"),
                    description:
                      attributionText(r) +
                      "\nCheck the original notice: " +
                      r.url,
                    url: r.url,
                  };
                })
            ),
            "text/calendar; charset=utf-8"
          );
        }
      } else {
        send(404, { error: "Not found." });
      }
    } catch (error) {
      if (
        error instanceof URIError ||
        /too long|Unknown opportunity|must be|out of range/.test(error.message)
      )
        send(400, { error: error.message });
      else
        send(500, {
          error:
            "Unable to serve this request. Check the catalogue and server setup.",
        });
    }
  };
}

function createServer(options) {
  return net.createServer(createRequestHandler(options));
}

function buildFeed(records, publicUrl, updatedAt) {
  return rss.buildRss({
    title: "Bihar24 RSS · Sarkari Explorer",
    link: publicUrl,
    description:
      "Source-linked government jobs, schemes, policies and exam resources for Bihar and India. Always confirm details with the original publisher.",
    builtAt: updatedAt ? new Date(updatedAt) : undefined,
    items: records.map(function (record) {
      return {
        title: record.title.en,
        link: record.url,
        guid: record.id,
        description: (record.summary.en || "") + attributionText(record),
        pubDate: new Date(record.source.fetchedAt),
      };
    }),
  });
}

function attributionText(record) {
  var a = record.source.attribution;
  return a
    ? "\n" +
        a.name +
        " — " +
        a.url +
        "\n" +
        record.source.license +
        " " +
        a.licenseUrl +
        "\n" +
        a.changes
    : "\nRights in source content remain with its publisher.";
}

module.exports = {
  createRequestHandler: createRequestHandler,
  createServer: createServer,
};
