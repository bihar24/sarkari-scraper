"use strict";

// Side-effect-free public entry point: importing the package never starts a
// server, performs a scrape or writes a file. Existing CLI bins remain intact.
module.exports = {
  sources: require("./utils/sources"),
  crawlJobList: require("./utils/crawl").crawlJobList,
  createCrawlClient: require("./utils/runtime").createCrawlClient,
  createRuntime: require("./utils/runtime").createRuntime,
  catalogue: {
    model: require("./catalog/model"),
    domains: require("./catalog/domains"),
    store: require("./catalog/store"),
    importers: require("./catalog/importers"),
    search: require("./catalog/query").search,
    createRequestHandler: require("./catalog/server").createRequestHandler,
    createServer: require("./catalog/server").createServer,
  },
};
