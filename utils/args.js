"use strict";

// Minimal dependency-free CLI flag parser shared by all three entry points.
//
// spec = [{ key, flags: ["-d", "--domain"], valueName, required, allowed,
//           defaultValue, parse, boolean }]
// Options with `boolean: true` are flags without a value (presence = true).
// Returns { values, errors, warnings, helpRequested }.
function parseArgs(argv, spec) {
  var values = {};
  var errors = [];
  var warnings = [];
  var helpRequested = false;
  var consumed = {};

  spec.forEach(function (opt) {
    values[opt.key] = opt.defaultValue;
  });

  function findOpt(flag) {
    return spec.find(function (opt) {
      return opt.flags.indexOf(flag) !== -1;
    });
  }

  var i;
  for (i = 0; i < argv.length; i++) {
    var token = argv[i];
    if (token === "-h" || token === "--help") {
      helpRequested = true;
      continue;
    }
    var name = token;
    var inlineValue = undefined; // reset every iteration (var is function-scoped)
    var eq = token.indexOf("=");
    if (token.startsWith("--") && eq !== -1) {
      name = token.slice(0, eq);
      inlineValue = token.slice(eq + 1);
    }
    var opt = findOpt(name);
    if (!opt) {
      if (name.startsWith("-")) {
        warnings.push('Unknown flag "' + token + '" ignored.');
      } else {
        warnings.push('Unexpected argument "' + token + '" ignored.');
      }
      continue;
    }
    if (opt.boolean) {
      if (inlineValue !== undefined) {
        errors.push('Flag "' + name + '" takes no value.');
        continue;
      }
      values[opt.key] = true;
      consumed[opt.key] = true;
      continue;
    }
    var value = inlineValue;
    if (value === undefined) {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("-")) {
        errors.push('Flag "' + name + '" expects a value.');
        continue;
      }
      value = argv[i + 1];
      i++;
    }
    if (opt.parse) {
      try {
        value = opt.parse(value);
      } catch (err) {
        errors.push('Invalid value for "' + name + '": ' + err.message);
        continue;
      }
    }
    if (opt.allowed && opt.allowed.indexOf(value) === -1) {
      errors.push(
        'Invalid value "' +
          value +
          '" for "' +
          name +
          '". Allowed: ' +
          opt.allowed.join(", ") +
          "."
      );
      continue;
    }
    values[opt.key] = value;
    consumed[opt.key] = true;
  }

  spec.forEach(function (opt) {
    if (opt.required && !consumed[opt.key]) {
      errors.push('Missing required flag: "' + opt.flags.join('" / "') + '".');
    }
  });

  return {
    values: values,
    errors: errors,
    warnings: warnings,
    helpRequested: helpRequested,
  };
}

function parseNonNegativeInt(label) {
  return function (value) {
    var n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(label + " must be a non-negative integer.");
    }
    return n;
  };
}

function printHelp(lines) {
  // Usage goes to stderr so `tool ... > out.json` captures only data.
  console.error(lines.join("\n"));
}

module.exports.parseArgs = parseArgs;
module.exports.parseNonNegativeInt = parseNonNegativeInt;
module.exports.printHelp = printHelp;
