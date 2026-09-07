#!/usr/bin/env node
"use strict";

// Usage: node tools/lint-workflows.js [--dir <dir>]
// Validates GitHub Actions workflow files for the errors GitHub rejects at
// parse time, before any job is created.
//
// Why this exists: a workflow that fails to parse never runs a step, so no
// check inside that workflow can catch the problem. It surfaces only as an
// "Invalid workflow file" run (~0s, zero jobs) when something triggers it.
// scrape.yml shipped with `secrets` used inside an `if:` condition; CI was
// green on that very commit while every Scrape run died at startup. This
// linter closes that gap by checking workflows from the outside.
//
// The main rule is context availability: GitHub allows a different set of
// contexts in `if:` depending on where the `if:` sits, and `secrets` is
// never allowed in any `if:`.

var fs = require("fs");
var path = require("path");
var yaml = require("js-yaml");

// Contexts GitHub exposes to `if:` conditions, by position.
// https://docs.github.com/actions/learn-github-actions/contexts#context-availability
var JOB_IF_CONTEXTS = ["github", "needs", "vars", "inputs"];
var STEP_IF_CONTEXTS = [
  "github",
  "needs",
  "strategy",
  "matrix",
  "job",
  "runner",
  "env",
  "vars",
  "steps",
  "inputs",
];

// Every context name GitHub knows about; anything matching one of these in a
// disallowed position is a hard error rather than an unknown identifier.
var ALL_CONTEXTS = [
  "github",
  "env",
  "vars",
  "job",
  "jobs",
  "steps",
  "runner",
  "secrets",
  "strategy",
  "matrix",
  "needs",
  "inputs",
];

var HELP = [
  "Usage: node tools/lint-workflows.js [--dir <dir>]",
  "",
  "Flags:",
  "  --dir <dir>   Workflow directory (default: .github/workflows).",
  "  -h, --help    Show this help.",
];

function flagValue(argv, name) {
  var index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) {
    return null;
  }
  return argv[index + 1];
}

// Strip single-quoted expression literals so a string such as
// `github.event.head_commit.message != 'secrets.TOKEN'` is not misread as a
// reference to the secrets context.
function stripLiterals(expression) {
  return expression.replace(/'(?:[^']|'')*'/g, "''");
}

// Collect the context names an expression actually dereferences, i.e. the
// `name.` or `name[` forms. A bare word like `always` is a function call, not
// a context, so it is deliberately ignored.
function referencedContexts(expression) {
  var cleaned = stripLiterals(expression);
  var found = [];
  ALL_CONTEXTS.forEach(function (context) {
    var pattern = new RegExp("\\b" + context + "\\s*(\\.|\\[)");
    if (pattern.test(cleaned) && found.indexOf(context) === -1) {
      found.push(context);
    }
  });
  return found;
}

function walk(node, trail, visit) {
  visit(node, trail);
  if (Array.isArray(node)) {
    node.forEach(function (child, index) {
      walk(child, trail.concat(String(index)), visit);
    });
    return;
  }
  if (node && typeof node === "object") {
    Object.keys(node).forEach(function (key) {
      walk(node[key], trail.concat(key), visit);
    });
  }
}

// ["jobs", "build", "steps", "2", "if"] -> step-level; ["jobs","build","if"]
// -> job-level. Anything else that is named `if` is not a condition we model.
function ifPosition(trail) {
  if (trail.length === 3 && trail[0] === "jobs" && trail[2] === "if") {
    return { kind: "job", where: "job " + trail[1] };
  }
  if (
    trail.length === 5 &&
    trail[0] === "jobs" &&
    trail[2] === "steps" &&
    trail[4] === "if"
  ) {
    return {
      kind: "step",
      where: "job " + trail[1] + ", step " + trail[3],
    };
  }
  return null;
}

function checkConditions(doc, report) {
  walk(doc, [], function (node, trail) {
    if (trail[trail.length - 1] !== "if") {
      return;
    }
    var position = ifPosition(trail);
    if (!position) {
      return;
    }
    // `if: true` and friends parse as booleans; only strings hold expressions.
    if (typeof node !== "string") {
      return;
    }
    var allowed = position.kind === "job" ? JOB_IF_CONTEXTS : STEP_IF_CONTEXTS;
    referencedContexts(node).forEach(function (context) {
      if (allowed.indexOf(context) !== -1) {
        return;
      }
      var detail =
        context === "secrets"
          ? "the secrets context is not available in any if: condition - " +
            "pass the secret through env: and test it inside the step"
          : "the " +
            context +
            " context is not available in a " +
            position.kind +
            "-level if:";
      report(position.where + ': if: uses "' + context + '" - ' + detail);
    });
  });
}

// `${{` without a closing `}}` is also rejected before the run starts.
function checkDelimiters(doc, report) {
  walk(doc, [], function (node, trail) {
    if (typeof node !== "string") {
      return;
    }
    var opens = (node.match(/\$\{\{/g) || []).length;
    var closes = (node.match(/\}\}/g) || []).length;
    if (opens > closes) {
      report(
        trail.join(".") +
          ": unbalanced ${{ ... }} in expression (" +
          opens +
          " opened, " +
          closes +
          " closed)"
      );
    }
  });
}

function checkStructure(doc, report) {
  // YAML 1.1 parsers fold `on` into the boolean true; js-yaml's 1.2 core
  // schema keeps it a string. Accept either so the check is parser-agnostic.
  var triggers = doc.on !== undefined ? doc.on : doc[true];
  if (triggers === undefined) {
    report("missing top-level `on:` trigger block");
  }
  if (!doc.jobs || typeof doc.jobs !== "object") {
    report("missing top-level `jobs:` block");
    return;
  }
  Object.keys(doc.jobs).forEach(function (jobId) {
    var job = doc.jobs[jobId];
    if (!job || typeof job !== "object") {
      report("job " + jobId + ": is not a mapping");
      return;
    }
    if (job.uses) {
      return; // reusable workflow call, no runs-on needed
    }
    if (!job["runs-on"]) {
      report("job " + jobId + ": missing `runs-on`");
    }
    if (!Array.isArray(job.steps)) {
      report("job " + jobId + ": missing `steps`");
    }
  });
}

function lintFile(file) {
  var problems = [];
  function report(message) {
    problems.push(message);
  }
  var raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    return ["cannot read file: " + err.message];
  }
  var doc;
  try {
    doc = yaml.load(raw);
  } catch (err) {
    return ["invalid YAML: " + err.message];
  }
  if (!doc || typeof doc !== "object") {
    return ["file does not contain a workflow mapping"];
  }
  checkStructure(doc, report);
  checkConditions(doc, report);
  checkDelimiters(doc, report);
  return problems;
}

function main() {
  var argv = process.argv.slice(2);
  if (argv.indexOf("-h") !== -1 || argv.indexOf("--help") !== -1) {
    console.error(HELP.join("\n"));
    process.exit(0);
  }
  var dir = flagValue(argv, "--dir") || path.join(".github", "workflows");
  var entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    console.error("Error: cannot read workflow directory: " + err.message);
    process.exit(2);
  }
  var files = entries
    .filter(function (name) {
      return /\.ya?ml$/.test(name);
    })
    .sort()
    .map(function (name) {
      return path.join(dir, name);
    });

  if (files.length === 0) {
    console.error("Error: no workflow files found in " + dir);
    process.exit(2);
  }

  var total = 0;
  files.forEach(function (file) {
    var problems = lintFile(file);
    total += problems.length;
    if (problems.length === 0) {
      console.log("ok  " + file);
      return;
    }
    problems.forEach(function (message) {
      console.log("ERR " + file + ": " + message);
    });
  });

  if (total > 0) {
    console.error(
      "\n" + total + " workflow problem(s) found; GitHub would reject these."
    );
    process.exit(1);
  }
  console.log("\n" + files.length + " workflow file(s) validated.");
}

main();
