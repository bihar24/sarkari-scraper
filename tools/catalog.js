#!/usr/bin/env node
"use strict";

var path = require("node:path");
var args = require("../utils/args");
var runtime = require("../utils/runtime");
var http = require("../utils/http");
var model = require("../catalog/model");
var domains = require("../catalog/domains");
var store = require("../catalog/store");
var importers = require("../catalog/importers");
var server = require("../catalog/server");

var HELP = [
  "Sarkari Explorer — jobs, schemes, policies and question papers",
  "",
  "node tools/catalog.js import [flags]",
  "  --tracker-dir <dir>     Read data/schemes and data/policies YAML from a local tracker checkout.",
  "  --tracker-github        Import the pinned public GitHub catalogue, not its live web API.",
  "  --tracker-ref <sha>     Full upstream Git commit SHA (default: reviewed snapshot).",
  "  --jobs <file>           Import job-list or run-scrapper JSON (incremental; keeps good older data).",
  "  --papers <file>         Import paper-list or wrapped paper-detail JSON.",
  "  --domains <file>        Import a local historical domain directory (Markdown/plain text).",
  "  --directory-source <url> Optional provenance URL for a local directory (not fetched).",
  "  --fetch-domains         Fetch the pinned captn3m0 gist; no listed website is crawled.",
  "  --store <file>          Catalogue file (default: .sarkari/catalog.json).",
  "  --timeout-ms <n>        Network timeout (default: 30000).",
  "  --retries <n>           Network retries (default: 3).",
  "  --quiet / --verbose     Control stderr logs. Data summary goes to stdout.",
  "",
  "node tools/catalog.js serve [flags]",
  "  --store <file>          Serve an imported catalogue; hot-reloads atomic replacements.",
  "  --port <n>             Port (default: PORT or 3000).",
  "  --host <host>          Bind address (default: 0.0.0.0).",
  "  --public-url <url>     Public catalogue URL for exported feed metadata.",
  "  --demo                 Use explicitly fictional examples, without network or files.",
  "",
  "GitHub authentication is optional: GITHUB_TOKEN increases API quotas. Never put tokens in flags.",
  "Tracker data is CC BY-SA 4.0; our original integration code is MIT. See THIRD_PARTY.md.",
  "Exit codes: 0 success, 1 failed/partial import, 2 usage error.",
];

async function main(argv) {
  var action = argv[0];
  if (!action || action === "--help" || action === "-h") {
    args.printHelp(HELP);
    return 0;
  }
  if (["import", "serve"].indexOf(action) === -1)
    throw new Error("usage: expected import or serve.");
  var spec = [
    { key: "store", flags: ["--store"], defaultValue: ".sarkari/catalog.json" },
  ];
  if (action === "serve") {
    spec = spec.concat([
      {
        key: "port",
        flags: ["--port"],
        parse: args.parseNonNegativeInt("port"),
        defaultValue: Number(process.env.PORT || 3000),
      },
      { key: "host", flags: ["--host"], defaultValue: "0.0.0.0" },
      {
        key: "publicUrl",
        flags: ["--public-url"],
        defaultValue: process.env.CATALOG_PUBLIC_URL,
      },
      { key: "demo", flags: ["--demo"], boolean: true, defaultValue: false },
    ]);
  } else {
    spec = spec
      .concat([
        { key: "trackerDir", flags: ["--tracker-dir"] },
        {
          key: "trackerGithub",
          flags: ["--tracker-github"],
          boolean: true,
          defaultValue: false,
        },
        { key: "trackerRef", flags: ["--tracker-ref"] },
        { key: "jobs", flags: ["--jobs"] },
        { key: "papers", flags: ["--papers"] },
        { key: "domains", flags: ["--domains"] },
        { key: "directorySource", flags: ["--directory-source"] },
        {
          key: "fetchDomains",
          flags: ["--fetch-domains"],
          boolean: true,
          defaultValue: false,
        },
      ])
      .concat(
        runtime.networkFlagSpecs().filter(function (s) {
          return ["ignoreRobots", "allowExternal"].indexOf(s.key) === -1;
        })
      );
  }
  var parsed = args.parseArgs(argv.slice(1), spec);
  if (parsed.helpRequested) {
    args.printHelp(HELP);
    return 0;
  }
  if (parsed.errors.length || parsed.warnings.length)
    throw new Error(
      "usage: " + parsed.errors.concat(parsed.warnings).join(" ")
    );
  var values = parsed.values;
  if (action === "serve") {
    if (
      !Number.isInteger(values.port) ||
      values.port < 0 ||
      values.port > 65535
    )
      throw new Error("usage: port must be 0–65535.");
    if (values.publicUrl && !model.url(values.publicUrl))
      throw new Error(
        "usage: public-url must be a credential-free HTTP(S) URL."
      );
    var app = server.createServer(
      values.demo
        ? {
            catalogue: require("../catalog/demo").demoCatalogue(),
            publicUrl: values.publicUrl,
          }
        : { file: path.resolve(values.store), publicUrl: values.publicUrl }
    );
    await new Promise(function (resolve, reject) {
      app.once("error", reject);
      app.listen(values.port, values.host, resolve);
    });
    console.error(
      "Sarkari Explorer listening on " +
        values.host +
        ":" +
        app.address().port +
        (values.demo ? " (illustrative demo)" : " (read-only catalogue)")
    );
    process.once("SIGTERM", function () {
      app.close();
    });
    process.once("SIGINT", function () {
      app.close();
    });
    return 0;
  }
  if (
    ![
      values.trackerDir,
      values.trackerGithub,
      values.jobs,
      values.papers,
      values.domains,
      values.fetchDomains,
    ].some(Boolean)
  )
    throw new Error("usage: choose at least one import source; see --help.");
  if (values.trackerDir && values.trackerGithub)
    throw new Error("usage: choose tracker-dir OR tracker-github.");
  if (values.domains && values.fetchDomains)
    throw new Error("usage: choose domains OR fetch-domains.");
  if (values.trackerRef && !/^[a-f0-9]{40}$/.test(values.trackerRef))
    throw new Error("usage: tracker-ref must be a full commit SHA.");
  if (
    values.directorySource &&
    (!values.domains || !model.url(values.directorySource))
  )
    throw new Error(
      "usage: directory-source needs --domains and a valid HTTP(S) provenance URL."
    );
  var rt = runtime.createRuntime(values);
  var groups = [];
  var directory = null;
  var failed = false;
  var stamp = new Date().toISOString();
  if (values.trackerDir || values.trackerGithub) {
    try {
      groups = groups.concat(
        values.trackerDir
          ? importers.importTrackerDirectory(values.trackerDir, {
              revision: values.trackerRef,
              fetchedAt: stamp,
            })
          : await importers.importTrackerGithub(rt.client, {
              revision: values.trackerRef,
              token: process.env.GITHUB_TOKEN,
              fetchedAt: stamp,
            })
      );
    } catch (error) {
      ["schemes", "policies"].forEach(function (plural) {
        groups.push({
          key: "tracker:" + plural,
          label: "Bihar " + plural,
          error: http.describeError(error),
        });
      });
    }
  }
  [
    ["jobs", "job"],
    ["papers", "paper"],
  ].forEach(function (pair) {
    if (!values[pair[0]]) return;
    try {
      groups.push(
        importers.importScrapedFile(values[pair[0]], {
          kind: pair[1],
          fetchedAt: stamp,
        })
      );
    } catch (error) {
      groups.push({
        key: pair[1] + ":" + path.basename(values[pair[0]]),
        label: pair[0],
        error: http.describeError(error),
      });
    }
  });
  if (values.domains || values.fetchDomains) {
    try {
      if (values.fetchDomains) {
        var response = await rt.client.get(domains.GIST_RAW, {
          maxRedirects: 0,
          maxContentLength: 2 * 1024 * 1024,
        });
        directory = Object.assign(domains.parseDirectory(response.data), {
          sourceUrl: domains.GIST_URL,
          revision: domains.GIST_REVISION,
          importedAt: stamp,
          license: null,
          notice:
            "Historical captn3m0 directory, no longer maintained. Discovery only; not proof of ownership or permission to crawl. No explicit licence found; review before redistribution.",
        });
      } else {
        directory = importers.importDomainFile(values.domains, {
          fetchedAt: stamp,
          sourceUrl: values.directorySource,
        });
      }
    } catch (error) {
      groups.push({
        key: "domain-directory",
        label: "Domain directory",
        error: http.describeError(error),
      });
    }
  }
  var saved = store.update(path.resolve(values.store), function (catalogue) {
    groups.forEach(function (group) {
      if (group.error || group.partial) {
        failed = true;
        rt.log.error(
          group.label + ": " + (group.error || group.warnings.join("; "))
        );
      }
      store.applyGroup(catalogue, group, stamp);
    });
    if (directory) {
      catalogue.directory = directory;
      catalogue.updatedAt = stamp;
      catalogue.sources["domain-directory"] = {
        label: "Historical domain directory",
        origin: directory.sourceUrl,
        revision: directory.revision,
        license: null,
        status: "ok",
        lastAttempt: stamp,
        lastSuccess: stamp,
        count: directory.domains.length,
        error: null,
      };
    }
    return catalogue;
  });
  console.log(
    JSON.stringify(
      {
        ok: !failed,
        store: values.store,
        total: saved.records.length,
        sources: saved.sources,
        directoryDomains: saved.directory ? saved.directory.domains.length : 0,
      },
      null,
      2
    )
  );
  return failed ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then(function (code) {
      process.exitCode = code;
    })
    .catch(function (error) {
      console.error(http.describeError(error));
      process.exitCode = /^usage:/.test(error.message) ? 2 : 1;
    });
}

module.exports = { main: main };
