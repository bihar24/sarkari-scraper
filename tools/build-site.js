#!/usr/bin/env node
"use strict";

// The browser application has no compilation step. Copy only its reviewed
// public assets into dist/ so Vercel never publishes package source files from
// the repository root.
var fs = require("node:fs");
var path = require("node:path");

var root = path.join(__dirname, "..");
var source = path.join(root, "web");
var output = path.join(root, "dist");
var required = [
  "index.html",
  "app.js",
  "styles.css",
  "favicon.svg",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  "social-card.png",
];

required.forEach(function (name) {
  if (!fs.statSync(path.join(source, name)).isFile()) {
    throw new Error("Missing web asset: " + name);
  }
});

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });

if (!fs.statSync(path.join(output, "index.html")).isFile()) {
  throw new Error("Web output did not contain index.html.");
}
console.log("Prepared static Vercel output in dist/.");
