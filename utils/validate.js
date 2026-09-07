"use strict";

// Output-shape validation: warns (never throws) when scraped data drifts
// from the expected record shapes, which usually means the site's markup
// changed.

var DETAIL_TYPES = ["String", "List", "Paragraph", "Link", "Table"];

function usableJobItem(item) {
  item = item || {};
  return Boolean(
    (item.postName || item.company || item.title) &&
    item.link &&
    /^https?:/i.test(String(item.link))
  );
}

function usablePaperItem(item) {
  item = item || {};
  return Boolean(
    (item.title || item.exam) &&
    item.link &&
    /^https?:/i.test(String(item.link))
  );
}

function countUsableJobItems(items) {
  return Array.isArray(items) ? items.filter(usableJobItem).length : 0;
}

function countUsablePaperItems(items) {
  return Array.isArray(items) ? items.filter(usablePaperItem).length : 0;
}

function checkJobList(items) {
  var warnings = [];
  if (!Array.isArray(items)) {
    return ["job list is not an array"];
  }
  var missingLink = 0;
  var missingName = 0;
  var i;
  for (i = 0; i < items.length; i++) {
    var item = items[i] || {};
    if (item.link === undefined || item.link === null || item.link === "") {
      missingLink += 1;
    }
    if (!item.postName && !item.company && !item.title) {
      missingName += 1;
    }
  }
  if (missingLink > 0) {
    warnings.push(
      missingLink + " of " + items.length + " list item(s) have no link"
    );
  }
  if (missingName > 0) {
    warnings.push(
      missingName + " of " + items.length + " list item(s) have no title"
    );
  }
  return warnings;
}

// Papers lists carry { exam, title, link } instead of { postName, link }.
function checkPaperList(items) {
  var warnings = [];
  if (!Array.isArray(items)) {
    return ["papers list is not an array"];
  }
  var missingLink = 0;
  var missingTitle = 0;
  var i;
  for (i = 0; i < items.length; i++) {
    var item = items[i] || {};
    if (item.link === undefined || item.link === null || item.link === "") {
      missingLink += 1;
    }
    if (!item.title && !item.exam) {
      missingTitle += 1;
    }
  }
  if (missingLink > 0) {
    warnings.push(
      missingLink + " of " + items.length + " list item(s) have no link"
    );
  }
  if (missingTitle > 0) {
    warnings.push(
      missingTitle + " of " + items.length + " list item(s) have no title"
    );
  }
  return warnings;
}

function checkJobDetail(records) {
  var warnings = [];
  if (!Array.isArray(records)) {
    return ["job detail is not an array"];
  }
  var unknownTypes = {};
  var empty = 0;
  var i;
  for (i = 0; i < records.length; i++) {
    var record = records[i] || {};
    if (DETAIL_TYPES.indexOf(record.type) === -1) {
      unknownTypes[record.type] = true;
    }
    var hasKey = record.key !== undefined && record.key !== null;
    var hasValue =
      record.value !== undefined &&
      record.value !== null &&
      record.value !== "";
    if (!hasKey && !hasValue) {
      empty += 1;
    }
  }
  var unknown = Object.keys(unknownTypes);
  if (unknown.length > 0) {
    warnings.push("unknown record type(s): " + unknown.join(", "));
  }
  if (empty > 0) {
    warnings.push(empty + " of " + records.length + " record(s) are empty");
  }
  return warnings;
}

module.exports.checkJobList = checkJobList;
module.exports.checkPaperList = checkPaperList;
module.exports.checkJobDetail = checkJobDetail;
module.exports.usableJobItem = usableJobItem;
module.exports.usablePaperItem = usablePaperItem;
module.exports.countUsableJobItems = countUsableJobItems;
module.exports.countUsablePaperItems = countUsablePaperItems;
module.exports.DETAIL_TYPES = DETAIL_TYPES;
