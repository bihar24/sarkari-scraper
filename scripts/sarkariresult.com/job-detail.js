"use strict";

var cheerio = require("cheerio");
var helper = require("../../utils/helper");

function getShortData($, elem) {
  var data = {};

  data.key = helper.formatKey($(elem).find("td:nth-child(1)").text());
  data.value = helper.formatString($(elem).find("td:nth-child(2)").text());
  if (data.key === null && data.value === null) {
    return {};
  }
  data.type = "String";

  return data;
}

function getHeaderData($, elem) {
  var data = {};

  var arr = $(elem).find("span").toArray();
  if (arr.length === 0) {
    return {};
  }

  data.key = "Header";
  data.value = [];
  var i;
  for (i = 0; i < arr.length; i++) {
    var text = helper.formatString($(arr[i]).text());
    if (text !== null) {
      data.value.push(text);
    }
  }
  if (data.value.length === 0) {
    return {};
  }
  data.type = "List";

  return data;
}

function getKey($, elem) {
  var data = {};

  if ($(elem).find("span").eq(0).length > 0) {
    data.key = helper.formatKey($(elem).find("span").eq(0).text());
  }

  return data;
}

function getValueAndType($, elem, pageUrl) {
  var data = {};

  var arr = [];

  var i;

  if ($(elem).find("ul").length > 0) {
    arr = $(elem).find("li").toArray();
    data.value = [];
    for (i = 0; i < arr.length; i++) {
      var text = helper.formatString($(arr[i]).text());
      if (text !== null) {
        data.value.push(text);
      }
    }
    data.type = "List";
  } else if ($(elem).find("a").length > 0) {
    arr = $(elem).find("a").toArray();
    data.value = [];
    for (i = 0; i < arr.length; i++) {
      data.value.push({
        text: helper.formatString($(arr[i]).text()),
        link: helper.formatLink(pageUrl, $(arr[i]).attr("href")),
      });
    }
    data.type = "Link";
  }

  return data;
}

function getTableData($, trArr, i, pageUrl) {
  var data = {};

  var valueArr = [];

  var temp1;
  var temp2;
  var temp3;

  var arr = [];

  var index;

  var k;

  for (index = i; index < trArr.length; index++) {
    arr = $(trArr[index]).find("td").toArray();
    if (arr.length < 2) {
      break;
    }
    temp1 = [];
    for (k = 0; k < arr.length; k++) {
      temp2 = getValueAndType($, arr[k], pageUrl);
      if (temp2.value === undefined) {
        temp2.value = helper.formatString($(arr[k]).text());
        temp2.type = "String";
      }
      temp3 = helper.formatString($(arr[k]).attr("rowspan"));
      if (temp3) {
        temp2.rowspan = temp3;
      }
      temp3 = helper.formatString($(arr[k]).attr("colspan"));
      if (temp3) {
        temp2.colspan = temp3;
      }
      temp1.push(temp2);
    }

    valueArr.push(temp1);
  }

  data.value = valueArr;
  data.type = "Table";

  return { data: data, index: index };
}

function isTable($, elem) {
  return $(elem).find("p").length > 0;
}

function getCellData($, elem, pageUrl) {
  var data = {};
  var temp;

  temp = getKey($, elem);
  Object.assign(data, temp);

  temp = getValueAndType($, elem, pageUrl);
  Object.assign(data, temp);

  temp = helper.formatString($(elem).text());
  if (temp && data.key === undefined && data.value === undefined) {
    data.key = temp;
  }

  return data;
}

// Join label-only cells with the value cells that follow them (section
// headings, "useful links" label/link pairs, tables preceded by a title).
// The key always comes from the label element; value/type from the content.
function mergeKeyValue(json, linkSectionKey) {
  var data = [];
  var linkSection = false;
  var i;

  for (i = 0; i < json.length; i++) {
    var curr = json[i];
    var nxt = json[i + 1];
    if (
      nxt !== undefined &&
      (linkSection || nxt.type === "Table") &&
      nxt.value !== undefined &&
      curr.value === undefined
    ) {
      var merged = Object.assign({}, nxt);
      if (curr.key !== undefined) {
        merged.key = curr.key;
      }
      data.push(merged);
      i++;
    } else {
      data.push(curr);
    }

    if (curr.key === linkSectionKey) {
      linkSection = true;
    }
  }

  return data;
}

function scrapJobDetail(html, url) {
  var $ = cheerio.load(html);

  var data = [];

  var temp;

  var i;
  var j;

  var arr1 = [];
  var arr2 = [];

  // Push Link information
  data.push({
    key: "Post Link",
    value: [
      {
        text: "Link",
        link: url,
      },
    ],
    type: "Link",
  });

  // Extract Table 1
  arr1 = $("div[align='left'] table").eq(0).find("tr").toArray();
  for (i = 0; i < arr1.length; i++) {
    if ($(arr1[i]).find("td").length === 2) {
      temp = getShortData($, arr1[i]);
      if (!helper.isDataEmpty(temp)) {
        data.push(temp);
      }
    }
  }

  // Extract Table 2
  arr1 = $("div[align='left'] table").eq(1).find("tr").toArray();
  for (i = 0; i < arr1.length; i++) {
    if (isTable($, arr1[i])) {
      temp = getTableData($, arr1, i, url);
      if (!helper.isDataEmpty(temp.data)) {
        data.push(temp.data);
      }
      i = temp.index;
      if (i >= arr1.length) {
        break;
      }
    }
    arr2 = $(arr1[i]).find("td").toArray();
    for (j = 0; j < arr2.length; j++) {
      if (i === 0 && j === 0) {
        temp = getHeaderData($, arr2[j]);
      } else {
        temp = getCellData($, arr2[j], url);
      }
      if (!helper.isDataEmpty(temp)) {
        data.push(temp);
      }
    }
  }

  data = mergeKeyValue(data, "Some Useful Important Links");

  return data;
}

module.exports.scrapJobDetail = scrapJobDetail;
// Correctly-spelled alias; the old name stays for backwards compatibility.
module.exports.scrapeJobDetail = scrapJobDetail;
// Exposed for unit tests.
module.exports.__internals = { mergeKeyValue: mergeKeyValue };
