"use strict";

var json2csv = require("json2csv");
var table = require("table");

var MAX_SPAN = 100; // backstop against pathological rowspan/colspan values
var CELL_WIDTH = 25;

function asText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

function formatArray(data) {
  if (!Array.isArray(data)) {
    return asText(data);
  }
  return data
    .map(function (item) {
      return asText(item);
    })
    .filter(function (item) {
      return item !== "";
    })
    .map(function (item) {
      return "• " + item;
    })
    .join("\n");
}

function formatParagraph(data) {
  if (!Array.isArray(data)) {
    return asText(data);
  }
  return data
    .map(function (item) {
      return asText(item);
    })
    .filter(function (item) {
      return item !== "";
    })
    .join("\n");
}

function formatLink(data) {
  if (!Array.isArray(data)) {
    return asText(data);
  }
  return data
    .map(function (item) {
      if (item && typeof item === "object") {
        var text = asText(item.text);
        var link = asText(item.link);
        if (text && link) {
          return text + " ( " + link + " )";
        }
        return text || link;
      }
      return asText(item);
    })
    .filter(function (item) {
      return item !== "";
    })
    .join("\n");
}

function renderCellValue(cell) {
  if (!cell || typeof cell !== "object") {
    return "";
  }
  switch (cell.type) {
    case "List":
      return formatArray(cell.value);
    case "Paragraph":
      return formatParagraph(cell.value);
    case "Link":
      return formatLink(cell.value);
    default:
      return asText(cell.value);
  }
}

function clampSpan(value) {
  var n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return Math.min(n, MAX_SPAN);
}

// Expand rowspan/colspan cells into a plain grid, then render an ASCII
// table. Never throws: falls back to a pipe-joined layout.
function formatTable(json) {
  if (!Array.isArray(json) || json.length === 0) {
    return "";
  }

  var grid = [];
  var currX = 0;
  var i;
  var j;

  for (i = 0; i < json.length; i++) {
    var row = json[i];
    if (!Array.isArray(row)) {
      currX += 1;
      continue;
    }
    if (grid[currX] === undefined) {
      grid[currX] = [];
    }
    var currY = 0;
    for (j = 0; j < row.length; j++) {
      var cell = row[j] || {};
      var rowspan = clampSpan(cell.rowspan);
      var colspan = clampSpan(cell.colspan);
      var content = renderCellValue(cell);

      var x;
      var y;
      for (x = 0; x < rowspan; x++) {
        for (y = 0; y < colspan; y++) {
          var gx = currX + x;
          var gy = currY + y;
          if (grid[gx] === undefined) {
            grid[gx] = [];
          }
          // Skip slots already occupied by a rowspan from a row above.
          while (grid[gx][gy] !== undefined) {
            gy += 1;
          }
          grid[gx][gy] = x === 0 && y === 0 ? content : "";
        }
      }
      currY += colspan;
    }
    currX += 1;
  }

  var width = 0;
  grid.forEach(function (row) {
    if (Array.isArray(row)) {
      width = Math.max(width, row.length);
    }
  });
  if (width === 0) {
    return "";
  }

  var normalized = grid.map(function (row) {
    var cells = Array.isArray(row) ? row.slice() : [];
    while (cells.length < width) {
      cells.push("");
    }
    return cells.map(function (cell) {
      return cell === undefined ? "" : asText(cell);
    });
  });

  var config = { columns: {} };
  var c;
  for (c = 0; c < width; c++) {
    config.columns[c] = { width: CELL_WIDTH };
  }

  try {
    return table.table(normalized, config);
  } catch (err) {
    return normalized
      .map(function (cells) {
        return cells.join(" | ");
      })
      .join("\n");
  }
}

// Convert rich record values (List/Paragraph/Link/Table) into plain strings
// for CSV output. Returns a NEW array; the input is left untouched.
function formatData(json) {
  if (!Array.isArray(json)) {
    return json;
  }
  return json.map(function (entry) {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    switch (entry.type) {
      case "List":
        return Object.assign({}, entry, { value: formatArray(entry.value) });
      case "Paragraph":
        return Object.assign({}, entry, {
          value: formatParagraph(entry.value),
        });
      case "Link":
        return Object.assign({}, entry, { value: formatLink(entry.value) });
      case "Table":
        return Object.assign({}, entry, { value: formatTable(entry.value) });
      default:
        return Object.assign({}, entry);
    }
  });
}

// Formula-injection defense (OWASP): scraped cells starting with = + - @
// (after whitespace) would execute as formulas when opened in Excel/Sheets.
// Prefix with a single quote so they render as inert text instead.
function sanitizeCell(value) {
  if (typeof value !== "string") {
    return value;
  }
  if (/^\s*[=+\-@]/.test(value)) {
    return "'" + value;
  }
  return value;
}

function sanitizeRow(row) {
  if (Array.isArray(row)) {
    return row.map(sanitizeRow);
  }
  if (row && typeof row === "object") {
    var out = {};
    Object.keys(row).forEach(function (key) {
      out[key] = sanitizeRow(row[key]);
    });
    return out;
  }
  return sanitizeCell(row);
}

function parse(data) {
  var rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) {
    return "";
  }
  try {
    return new json2csv.Parser().parse(rows.map(sanitizeRow));
  } catch (err) {
    throw new Error("CSV conversion failed: " + err.message);
  }
}

module.exports.sanitizeCell = sanitizeCell;
module.exports.formatData = formatData;
module.exports.formatTable = formatTable;
module.exports.formatArray = formatArray;
module.exports.formatParagraph = formatParagraph;
module.exports.formatLink = formatLink;
module.exports.parse = parse;
