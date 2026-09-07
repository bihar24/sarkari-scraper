"use strict";

// Vercel invokes this exported request handler for every route. Do not call
// listen() here: a long-running Node HTTP server is not compatible with the
// Vercel Functions lifecycle.
var path = require("node:path");
var server = require("../catalog/server");
var store = require("../catalog/store");
var deployment = require("../catalog/deployment");

var catalogue;
try {
  catalogue = deployment.deploymentCatalogue(path.join(__dirname, "../data"));
} catch (error) {
  catalogue = store.empty();
  catalogue.sources.deployment = {
    label: "Committed deployment catalogue",
    status: "error",
    error: "Deployment data could not be loaded.",
  };
}

module.exports = server.createRequestHandler({
  catalogue: catalogue,
  publicUrl: "https://rss.bihar24.com/",
});
