"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var cp = require("node:child_process");
var model = require("../catalog/model");
var domains = require("../catalog/domains");
var store = require("../catalog/store");
var imports = require("../catalog/importers");
var query = require("../catalog/query");
var server = require("../catalog/server");
var deployment = require("../catalog/deployment");
var demo = require("../catalog/demo");
var digest = require("../utils/digest");
var runtime = require("../utils/runtime");
var http = require("../utils/http");

function rawScheme(overrides) {
  return Object.assign(
    {
      name_en: "Example student assistance",
      name_hi: "उदाहरण छात्र सहायता",
      objective_en: "An authored fixture, not a real government scheme.",
      categories: ["education"],
      source_url: "https://education.bihar.gov.in/notice",
      last_verified: "2026-06-01",
      status: "active",
      status_evidence: "Fixture-only evidence; not a live assertion.",
      min_age: 18,
      max_age: 30,
      income_ceiling: 200000,
      personas: ["student"],
      metrics: [{ value: null, provenance: "rti_needed", source_url: null }],
    },
    overrides
  );
}
function normalized(overrides, options) {
  return model.normalizeTracker(
    rawScheme(overrides),
    Object.assign(
      {
        kind: "scheme",
        slug: "fixture",
        fetchedAt: "2026-09-07T00:00:00Z",
        revision: imports.TRACKER_REF,
      },
      options
    )
  );
}
function temp(t) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "sarkari-catalog-"));
  t.after(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
function cli(flags) {
  return cp.spawnSync(
    process.execPath,
    [path.join(__dirname, "../tools/catalog.js")].concat(flags),
    { encoding: "utf8", timeout: 10000 }
  );
}

test.describe("catalogue normalization and evidence", function () {
  test.it(
    "preserves bilingual evidence, missing figures, review dates and separate licensing",
    function () {
      var record = normalized();
      assert.equal(record.id, "scheme:tracker:fixture");
      assert.equal(record.title.hi, "उदाहरण छात्र सहायता");
      assert.equal(record.source.lastVerified, "2026-06-01");
      assert.equal(record.source.fetchedAt, "2026-09-07T00:00:00Z");
      assert.equal(record.source.license, "CC-BY-SA-4.0");
      assert.match(record.source.attribution.name, /Vishal Arya/);
      assert.equal(record.original.metrics[0].value, null);
      assert.equal(record.original.metrics[0].provenance, "rti_needed");
      assert.equal(
        model.freshness(record, new Date("2026-09-07T00:00:00Z")).state,
        "needs_review"
      );
    }
  );
  test.it(
    "rejects incomplete or malicious source records rather than inventing evidence",
    function () {
      assert.throws(function () {
        normalized({ source_url: "javascript:alert(1)" });
      }, /source_url/);
      assert.throws(function () {
        normalized({ last_verified: "2026-02-30" });
      }, /last_verified/);
      assert.throws(function () {
        normalized({ status_evidence: "" });
      }, /evidence/);
      assert.equal(model.url("https://user:secret@example.gov.in/"), null);
      assert.throws(function () {
        imports.parseYaml("name_en: One\nname_en: Two");
      }, /Invalid/);
      assert.throws(function () {
        imports.parseYaml("a: &a [1]\nb: *a");
      }, /alias/i);
      assert.throws(function () {
        imports.parseYaml("x: !!js/function function(){}");
      }, /Invalid/);
    }
  );
  test.it(
    "has stable IDs and detects content changes, not new import timestamps",
    function () {
      var first = normalized();
      var later = normalized(
        {},
        {
          fetchedAt: "2026-09-08T00:00:00Z",
          revision: "b".repeat(40),
          recordUrl: "https://github.com/x/y/blob/new/file",
        }
      );
      assert.equal(first.id, later.id);
      assert.equal(model.fingerprint(first), model.fingerprint(later));
      assert.notEqual(
        model.fingerprint(first),
        model.fingerprint(normalized({ objective_en: "Changed" }))
      );
      var sharedSource = normalized({}, { slug: "other-scheme" });
      assert.notEqual(first.id, sharedSource.id);
    }
  );
  test.it(
    "keeps unknown eligibility possible and never guarantees qualification",
    function () {
      assert.equal(
        model.possibleMatch(normalized(), { age: 31 }).matches,
        false
      );
      assert.equal(
        model.possibleMatch(normalized(), { income: 300000 }).matches,
        false
      );
      assert.equal(
        model.possibleMatch(normalized(), { persona: "farmer" }).matches,
        false
      );
      var missing = normalized({
        min_age: null,
        max_age: null,
        income_ceiling: null,
        personas: [],
      });
      assert.equal(model.possibleMatch(missing, { age: 99 }).matches, true);
      assert.match(
        model.possibleMatch(missing, {}).assessment,
        /not_eligibility_confirmation/
      );
    }
  );
  test.it(
    "does not promote policy validity windows into verified active implementation",
    function () {
      var policy = normalized(
        { period_start: "2024-01-01", period_end: "2029-01-01" },
        { kind: "policy" }
      );
      assert.equal(
        model.displayStatus(policy, new Date("2026-09-07")),
        "unverified"
      );
      policy.original.is_draft = true;
      assert.equal(
        model.displayStatus(policy, new Date("2026-09-07")),
        "draft"
      );
      policy.original.successor_policy = "New policy";
      assert.equal(model.displayStatus(policy), "superseded");
    }
  );
  test.it(
    "accepts job lists, rejects empty details, and preserves distinct paper groups",
    function () {
      var row = {
        postName: "Example job",
        lastDate: "30-Sep-2026",
        link: "https://jobs.example.org/notice",
      };
      var job = model.normalizeScraped(row);
      assert.equal(job.deadline.date, "2026-09-30");
      assert.equal(job.source.lastVerified, null);
      assert.equal(job.source.license, null);
      assert.equal(job.applyUrl, null);
      assert.throws(function () {
        model.normalizeScraped({
          url: row.link,
          detail: [
            { key: "Post Link", value: [{ link: row.link }], type: "Link" },
          ],
        });
      }, /only a source link/);
      var a = model.normalizeScraped(
        { link: row.link, exam: "Exam A" },
        { kind: "paper" }
      );
      var b = model.normalizeScraped(
        { link: row.link, exam: "Exam B" },
        { kind: "paper" }
      );
      assert.notEqual(a.id, b.id);
    }
  );
  test.it(
    "extracts labelled deadlines inside Important Dates lists and table cells",
    function () {
      var job = {
        detail: [
          {
            key: "Important Dates",
            type: "List",
            value: ["Published: 01-Sep-2026", "Last Date: 30-Sep-2026"],
          },
        ],
      };
      assert.equal(
        digest.extractDeadline(job).parsed.toISOString().slice(0, 10),
        "2026-09-30"
      );
      var table = {
        detail: [
          {
            key: "Dates",
            type: "Table",
            value: [
              [
                { type: "String", value: "Closing Date" },
                { type: "String", value: "31/10/2026" },
              ],
            ],
          },
        ],
      };
      assert.equal(
        digest.extractDeadline(table).parsed.toISOString().slice(0, 10),
        "2026-10-31"
      );
      assert.equal(
        digest.extractDeadline({
          detail: [{ key: "Published", value: "01-Sep-2026", type: "String" }],
        }),
        null
      );
    }
  );
});

test.describe("historical directory trust boundaries", function () {
  test.it(
    "parses actual gist formats, normalizes case, and deduplicates exact hosts",
    function () {
      var parsed = domains.parseDirectory(
        "# gov.in (3)\n- Bihar.gov.in\n- bihar.gov.in\n- [www.nic.in](https://www.nic.in/)\n# Other\n- example.org\n- *.gov.in\n- javascript:alert(1)\n- 127.0.0.1\n"
      );
      assert.deepEqual(parsed.domains, [
        "bihar.gov.in",
        "example.org",
        "www.nic.in",
      ]);
      assert.equal(parsed.duplicates, 1);
      assert.equal(parsed.invalid, 3);
    }
  );
  test.it(
    "does not trust spoofed suffixes, URL credentials, subdomains of listed hosts, or private IP encodings",
    function () {
      assert.equal(
        domains.classify("https://bihar.gov.in.evil.org").namespace,
        null
      );
      assert.equal(domains.classify("https://evilgov.in").namespace, null);
      assert.equal(
        domains.classify("https://bihar.gov.in@evil.org").hostname,
        null
      );
      assert.equal(
        domains.classify("https://bpsc.bihar.gov.in").namespace,
        "gov.in"
      );
      assert.equal(
        domains.classify("https://bihar.gov.in").ownershipVerified,
        false
      );
      assert.equal(
        domains.classify("https://sub.example.org", ["example.org"])
          .directoryListed,
        false
      );
      assert.equal(
        domains.classify("https://example.org", ["example.org"]).classification,
        "historical_directory"
      );
      assert.equal(domains.hostname("2130706433"), null);
      assert.equal(domains.hostname("http://[::1]"), null);
      assert.throws(function () {
        domains.parseDirectory("# empty\n");
      }, /No valid/);
    }
  );
});

test.describe("catalogue storage and imports", function () {
  test.it(
    "upserts changes by ID, keeps good records on failure, and only prunes complete snapshots",
    function () {
      var value = store.empty();
      var group = {
        key: "tracker:schemes",
        label: "Schemes",
        replace: true,
        records: [normalized()],
      };
      store.applyGroup(value, group, "2026-09-07T00:00:00Z");
      assert.equal(value.changes.length, 1);
      store.applyGroup(
        value,
        Object.assign({}, group, {
          records: [normalized({}, { fetchedAt: "2026-09-08T00:00:00Z" })],
        })
      );
      assert.equal(value.changes.length, 1);
      store.applyGroup(
        value,
        Object.assign({}, group, {
          records: [normalized({ name_en: "Revised fixture title" })],
        })
      );
      assert.equal(value.changes[0].action, "updated");
      store.applyGroup(value, {
        key: group.key,
        error: "upstream unavailable",
      });
      assert.equal(value.records.length, 1);
      assert.equal(value.sources[group.key].status, "error");
      assert.throws(function () {
        store.applyGroup(value, { key: group.key, records: [] });
      }, /Empty/);
      store.applyGroup(
        value,
        Object.assign({}, group, {
          records: [normalized({}, { slug: "new" })],
          partial: true,
          warnings: ["one failed"],
        })
      );
      assert.equal(value.records.length, 2);
      store.applyGroup(
        value,
        Object.assign({}, group, { records: [normalized({}, { slug: "new" })] })
      );
      assert.equal(value.records.length, 1);
      assert.equal(value.changes[0].action, "removed");
    }
  );
  test.it(
    "writes atomically, refuses concurrent writers and preserves corrupt files for diagnosis",
    function (t) {
      var file = path.join(temp(t), "catalog.json");
      store.update(file, function (value) {
        return store.applyGroup(value, {
          key: "test",
          label: "Test",
          records: [normalized()],
        });
      });
      assert.equal(store.load(file).records.length, 1);
      fs.writeFileSync(file + ".lock", "another writer");
      assert.throws(function () {
        store.update(file, function (v) {
          return v;
        });
      }, /locked/);
      fs.unlinkSync(file + ".lock");
      var before = fs.readFileSync(file, "utf8");
      assert.throws(function () {
        store.update(file, function () {
          throw new Error("fail");
        });
      }, /fail/);
      assert.equal(fs.readFileSync(file, "utf8"), before);
      assert.equal(fs.existsSync(file + ".lock"), false);
      fs.writeFileSync(file, "corrupt");
      assert.throws(function () {
        store.update(file, function (v) {
          return v;
        });
      });
      assert.equal(fs.readFileSync(file, "utf8"), "corrupt");
    }
  );
  test.it(
    "imports a local tracker snapshot without executing anything or stamping it verified today",
    function (t) {
      var dir = temp(t);
      fs.mkdirSync(path.join(dir, "data/schemes"), { recursive: true });
      fs.mkdirSync(path.join(dir, "data/policies"), { recursive: true });
      var yaml = require("yaml");
      fs.writeFileSync(
        path.join(dir, "data/schemes/fixture.yaml"),
        yaml.stringify(rawScheme())
      );
      fs.writeFileSync(
        path.join(dir, "data/policies/fixture.yaml"),
        yaml.stringify(rawScheme({ name_en: "Fixture policy" }))
      );
      var groups = imports.importTrackerDirectory(dir);
      assert.equal(groups[0].records.length, 1);
      assert.equal(groups[1].records.length, 1);
      assert.equal(groups[0].records[0].source.lastVerified, "2026-06-01");
      fs.writeFileSync(path.join(dir, "data/schemes/bad.yaml"), "[broken");
      assert.match(imports.importTrackerDirectory(dir)[0].error, /bad.yaml/);
    }
  );
  test.it(
    "uses a pinned GitHub tree/blobs, rejects truncation, and marks unavailable blobs as failed snapshots",
    async function () {
      var calls = [];
      var yaml = require("yaml").stringify(rawScheme());
      var client = {
        get: async function (url) {
          calls.push(url);
          if (url.includes("/trees/"))
            return {
              data: {
                tree: [
                  {
                    mode: "100644",
                    type: "blob",
                    path: "data/schemes/fixture.yaml",
                    sha: "a".repeat(40),
                    size: yaml.length,
                  },
                ],
              },
            };
          return {
            data: {
              encoding: "base64",
              content: Buffer.from(yaml).toString("base64"),
            },
          };
        },
      };
      var result = await imports.importTrackerGithub(client, { delayMs: 0 });
      assert.equal(result[0].records.length, 1);
      assert.match(result[1].error, /No valid policies/);
      assert.match(calls[0], new RegExp(imports.TRACKER_REF));
      await assert.rejects(
        imports.importTrackerGithub(client, { revision: "main" }),
        /commit SHA/
      );
      await assert.rejects(
        imports.importTrackerGithub({
          get: async function () {
            return { data: { tree: [], truncated: true } };
          },
        }),
        /incomplete/
      );
      var failed = await imports.importTrackerGithub(
        {
          get: async function (url) {
            if (url.includes("/trees/")) return client.get(url);
            throw new Error("offline");
          },
        },
        { delayMs: 0 }
      );
      assert.match(failed[0].error, /offline/);
    }
  );
  test.it(
    "CLI imports usable partial job output, signals failure and keeps prior data on empty imports",
    function (t) {
      var dir = temp(t);
      var input = path.join(dir, "jobs.json");
      var file = path.join(dir, "catalog.json");
      fs.writeFileSync(
        input,
        JSON.stringify([
          { postName: "Fixture job", link: "https://example.gov.in/job/1" },
          { url: "https://example.gov.in/job/2", error: "offline" },
        ])
      );
      var result = cli(["import", "--jobs", input, "--store", file]);
      assert.equal(result.status, 1);
      assert.equal(JSON.parse(result.stdout).total, 1);
      assert.equal(store.load(file).sources["job:jobs.json"].status, "partial");
      fs.writeFileSync(input, "[]");
      assert.equal(cli(["import", "--jobs", input, "--store", file]).status, 1);
      assert.equal(store.load(file).records.length, 1);
      assert.equal(cli(["import", "--mispelled", input]).status, 2);
      assert.equal(cli(["serve", "--port", "999999"]).status, 2);
      assert.equal(cli(["--help"]).status, 0);
    }
  );
  test.it(
    "builds a Vercel-safe snapshot from committed automation outputs without writing",
    function (t) {
      var dir = temp(t);
      fs.writeFileSync(
        path.join(dir, "lastrun.json"),
        JSON.stringify({ at: "2026-09-07T01:02:03Z" })
      );
      fs.writeFileSync(
        path.join(dir, "jobs-all.json"),
        JSON.stringify([
          {
            postName: "Fixture deployment job",
            link: "https://example.gov.in/job/1",
          },
        ])
      );
      var snapshot = deployment.deploymentCatalogue(dir);
      assert.equal(snapshot.records.length, 1);
      assert.equal(snapshot.records[0].title.en, "Fixture deployment job");
      assert.equal(
        snapshot.records[0].source.fetchedAt,
        "2026-09-07T01:02:03.000Z"
      );
      assert.equal(snapshot.updatedAt, "2026-09-07T01:02:03.000Z");
      assert.equal(
        fs.readdirSync(dir).some(function (name) {
          return name.endsWith(".lock") || name === "catalog.json";
        }),
        false
      );
    }
  );
});

test.describe("read-only public API", function () {
  async function app(t, options) {
    var instance = server.createServer(
      options || { catalogue: demo.demoCatalogue() }
    );
    await new Promise(function (resolve) {
      instance.listen(0, "127.0.0.1", resolve);
    });
    t.after(function () {
      instance.closeAllConnections();
      return new Promise(function (resolve) {
        instance.close(resolve);
      });
    });
    return "http://127.0.0.1:" + instance.address().port;
  }
  test.it(
    "serves the dashboard and filters/paginates records in both languages",
    async function (t) {
      var base = await app(t);
      var home = await fetch(base);
      var html = await home.text();
      assert.match(html, /Sarkari Explorer/);
      assert.match(html, /https:\/\/rss\.bihar24\.com\//);
      assert.match(html, /rel="alternate"[\s\S]+application\/rss\+xml/);
      assert.match(
        home.headers.get("content-security-policy"),
        /script-src 'self'/
      );
      assert.equal(home.headers.get("x-frame-options"), null);
      assert.match(
        await (await fetch(base + "/robots.txt")).text(),
        /Sitemap: https:\/\/rss\.bihar24\.com\/sitemap\.xml/
      );
      assert.match(
        await (await fetch(base + "/sitemap.xml")).text(),
        /<loc>https:\/\/rss\.bihar24\.com\/<\/loc>/
      );
      var socialCard = await fetch(base + "/social-card.png");
      assert.equal(socialCard.headers.get("content-type"), "image/png");
      assert.deepEqual(
        Buffer.from(await socialCard.arrayBuffer()).subarray(1, 4),
        Buffer.from("PNG")
      );
      var font = await fetch(base + "/fonts/devanagari-400.woff2");
      assert.equal(font.headers.get("content-type"), "font/woff2");
      assert.equal(
        Buffer.from(await font.arrayBuffer())
          .subarray(0, 4)
          .toString(),
        "wOF2"
      );
      var meta = await (await fetch(base + "/api/v1")).json();
      assert.equal(meta.demo, true);
      assert.equal(meta.stats.total, 6);
      var found = await (
        await fetch(base + "/api/v1/opportunities?kind=scheme&limit=1&offset=1")
      ).json();
      assert.equal(found.total, 3);
      assert.equal(found.results.length, 1);
      assert.equal(found.results[0].original, undefined);
      var hindi = await (
        await fetch(
          base + "/api/v1/opportunities?q=" + encodeURIComponent("छात्र")
        )
      ).json();
      assert.equal(hindi.total, 1);
      var detail = await (
        await fetch(
          base +
            "/api/v1/opportunities/" +
            encodeURIComponent(hindi.results[0].id)
        )
      ).json();
      assert.equal(detail.original.demo, true);
      assert.equal(
        (await fetch(base + "/api/v1/opportunities?limit=10001")).status,
        400
      );
      assert.equal(
        (await fetch(base + "/api/v1/opportunities?kind=unknown")).status,
        400
      );
      assert.equal(
        (await fetch(base + "/api/v1/opportunities/missing")).status,
        404
      );
      assert.equal(
        (await fetch(base + "/api/v1/opportunities/%ZZ")).status,
        400
      );
    }
  );
  test.it(
    "does not expose import/write/file endpoints and works through a preview host",
    async function (t) {
      var base = await app(t);
      var response = await fetch(base + "/api/v1", {
        headers: { Host: "3000-sandbox.e2b.app" },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.equal(
        (
          await fetch(base + "/api/v1/import", {
            method: "POST",
            body: '{"url":"http://169.254.169.254"}',
          })
        ).status,
        405
      );
      assert.equal((await fetch(base + "/.sarkari/catalog.json")).status, 404);
      assert.equal((await fetch(base + "/.env")).status, 404);
      assert.equal((await fetch(base + "/package.json")).status, 404);
      assert.equal(
        (await fetch(base + "/api/v1", { method: "OPTIONS" })).status,
        204
      );
      assert.equal(
        await (await fetch(base + "/", { method: "HEAD" })).text(),
        ""
      );
    }
  );
  test.it(
    "retains attribution and unknown figures across exports",
    async function (t) {
      var catalogue = store.empty();
      store.applyGroup(catalogue, {
        key: "tracker",
        label: "Tracker",
        records: [
          normalized({
            name_en: "=HYPERLINK(unsafe)",
            objective_en: "<script>alert(1)</script>",
          }),
        ],
      });
      var base = await app(t, { catalogue: catalogue });
      var exported = await (
        await fetch(base + "/api/v1/export?format=json")
      ).json();
      assert.equal(exported.records[0].source.license, "CC-BY-SA-4.0");
      assert.equal(exported.records[0].original.metrics[0].value, null);
      var spreadsheet = await (
        await fetch(base + "/api/v1/export?format=csv")
      ).text();
      assert.match(spreadsheet, /'=HYPERLINK/);
      assert.match(spreadsheet, /Vishal Arya/);
      var feed = await (await fetch(base + "/api/v1/export?format=rss")).text();
      assert.match(feed, /CC-BY-SA-4.0/);
      assert.match(feed, /&lt;script&gt;/);
      assert.doesNotMatch(feed, /<script>/);
      var canonicalFeed = await fetch(base + "/feed.xml");
      assert.equal(canonicalFeed.headers.get("content-disposition"), null);
      assert.match(
        await canonicalFeed.text(),
        /Bihar24 RSS · Sarkari Explorer/
      );
      var oldFeed = await fetch(base + "/rss.xml", { redirect: "manual" });
      assert.equal(oldFeed.status, 308);
      assert.equal(oldFeed.headers.get("location"), "/feed.xml");
      assert.match(
        await (await fetch(base + "/api/v1/export?format=ics")).text(),
        /BEGIN:VCALENDAR/
      );
    }
  );
  test.it(
    "hot-reloads atomic writes and serves the last valid snapshot when a file is corrupted",
    async function (t) {
      var file = path.join(temp(t), "catalog.json");
      store.atomicWrite(file, demo.demoCatalogue());
      var base = await app(t, { file: file });
      assert.equal(
        (await (await fetch(base + "/api/v1")).json()).stats.total,
        6
      );
      store.update(file, function (value) {
        value.records.pop();
        return value;
      });
      assert.equal(
        (await (await fetch(base + "/api/v1")).json()).stats.total,
        5
      );
      fs.writeFileSync(file, "broken");
      assert.equal(
        (await (await fetch(base + "/api/v1")).json()).stats.total,
        5
      );
      assert.equal((await fetch(base + "/health")).status, 503);
    }
  );
  test.it(
    "validates bounded filters and supports a side-effect-free package entry",
    function () {
      assert.throws(function () {
        query.parseQuery(new URLSearchParams("age=-1"));
      }, /non-negative/);
      assert.throws(function () {
        query.parseQuery(new URLSearchParams("q=" + "a".repeat(201)));
      }, /too long/);
      assert.throws(function () {
        query.parseQuery(new URLSearchParams("income=999999999999999999"));
      });
      assert.equal(
        typeof require("..").catalogue.createRequestHandler,
        "function"
      );
      assert.equal(typeof require("..").catalogue.createServer, "function");
      assert.equal(typeof require("..").sources.requireListParser, "function");
    }
  );
});

test.describe("integration hardening", function () {
  test.it(
    "runs the existing scraper through catalogue ingestion and retains output on an empty crawl",
    function (t) {
      var dir = temp(t);
      var output = path.join(dir, "jobs.json");
      function run(empty) {
        var bootstrap = `
        const http = require('./utils/http');
        const original = http.createClient;
        http.createClient = function(options) {
          const client = original(options);
          client.defaults.adapter = async function(config) {
            const pathname = new URL(config.url).pathname;
            let data = '';
            if (pathname === '/robots.txt') data = 'User-agent: *\\nAllow: /\\n';
            else if (pathname === '/category/hot-job' && !${JSON.stringify(empty)}) data = '<div class="category-typepost"><div><ul><li><a href="/job/1">Fixture job</a></li></ul></div></div>';
            else if (pathname === '/job/1') data = '<div class="newpage-row2"><table><tr><td><h1>Fixture job</h1></td></tr><tr><td><h3>Fees</h3><ul><li>See official notice</li></ul></td></tr></table></div>';
            return {data, status:200, headers:{'content-type':'text/plain'}, config};
          };
          return client;
        };
        process.argv = ${JSON.stringify([process.execPath, "run-scrapper.js", "-d", "sarkariexam.com", "-o", output, "--max-pages", "1", "--max-jobs", "1", "--delay-ms", "0", "--quiet"])};
        require('./run-scrapper.js');
      `;
        return cp.spawnSync(process.execPath, ["-e", bootstrap], {
          cwd: path.join(__dirname, ".."),
          encoding: "utf8",
          timeout: 10000,
        });
      }
      assert.equal(run(false).status, 0);
      var originalOutput = fs.readFileSync(output, "utf8");
      var group = imports.importScrapedFile(output);
      assert.equal(group.records.length, 1);
      assert.equal(group.records[0].title.en, "Fixture job");
      assert.equal(group.records[0].kind, "job");
      assert.equal(run(true).status, 1);
      assert.equal(fs.readFileSync(output, "utf8"), originalOutput);
    }
  );

  test.it(
    "checks robots on each requested path and redirect, not just the entry",
    async function () {
      var checked = [];
      var fetched = [];
      var rt = {
        robots: {
          isAllowed: async function (url) {
            checked.push(url);
            return { allowed: !url.endsWith("/blocked"), reason: "test" };
          },
        },
        client: {
          get: async function (url, config) {
            fetched.push(url);
            assert.equal(config.maxRedirects, 0);
            return { status: 302, headers: { location: "/blocked" } };
          },
        },
      };
      var guarded = runtime.createCrawlClient(rt, { domain: "example.gov.in" });
      await assert.rejects(
        guarded.get("https://example.gov.in/start"),
        /robots/
      );
      assert.deepEqual(checked, [
        "https://example.gov.in/start",
        "https://example.gov.in/blocked",
      ]);
      assert.deepEqual(fetched, ["https://example.gov.in/start"]);
      rt.client.get = async function () {
        return {
          status: 302,
          headers: { location: "https://other.example.org/private" },
        };
      };
      await assert.rejects(
        guarded.get("https://example.gov.in/start"),
        /off-site/
      );
    }
  );
  test.it(
    "redacts tokens, userinfo, queries and secret POST paths from errors",
    function () {
      var error = {
        response: { status: 401 },
        config: { url: "https://api.telegram.org/botFAKE_SECRET/sendMessage" },
      };
      assert.doesNotMatch(http.describeError(error), /FAKE_SECRET/);
      error.config = {
        method: "post",
        url: "https://example.org/hooks/SECRET?token=MORE",
      };
      assert.doesNotMatch(http.describeError(error), /SECRET|MORE/);
      assert.doesNotMatch(
        http.redactUrl("https://user:PASSWORD@example.org/path?token=SECRET"),
        /PASSWORD|SECRET|user/
      );
    }
  );
  test.it(
    "does not consume new alerts or create a SQLite archive during a dry run",
    function (t) {
      var dir = temp(t);
      var file = path.join(dir, "jobs.json");
      var stateFile = path.join(dir, "state.json");
      var db = path.join(dir, "archive.db");
      fs.writeFileSync(
        file,
        JSON.stringify([
          {
            url: "https://example.gov.in/job",
            detail: [
              { key: "Name of Post", type: "String", value: "Fixture job" },
            ],
          },
        ])
      );
      var before = JSON.stringify(digest.blankState());
      fs.writeFileSync(stateFile, before);
      var result = cp.spawnSync(
        process.execPath,
        [
          path.join(__dirname, "../job-digest.js"),
          "-i",
          file,
          "--state",
          stateFile,
          "--db",
          db,
          "--alert",
          "telegram",
          "--all",
          "--dry-run",
        ],
        { encoding: "utf8", timeout: 10000 }
      );
      assert.equal(result.status, 0);
      assert.match(result.stdout, /Fixture job/);
      assert.equal(fs.readFileSync(stateFile, "utf8"), before);
      assert.equal(fs.existsSync(db), false);
    }
  );
});
