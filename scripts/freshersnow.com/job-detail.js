"use strict";

var cheerio = require("cheerio");
var helper = require("../../utils/helper");

function getValueAndType($, elem, pageUrl) {
  var data = {};

  var temp1;
  var temp2;
  var temp3;

  var i;
  var j;
  var k;

  var arr1 = [];
  var arr2 = [];
  var arr3 = [];

  switch (helper.tagName($, elem)) {
    case "UL":
      data.value = [];
      arr1 = $(elem).find("li").toArray();
      for (i = 0; i < arr1.length; i++) {
        var item = helper.formatString($(arr1[i]).text());
        if (item !== null) {
          data.value.push(item);
        }
      }
      data.type = "List";
      break;
    case "TABLE":
      data.value = [];
      arr1 = $(elem).find("tr").toArray();
      for (i = 0; i < arr1.length; i++) {
        temp1 = [];
        arr2 = $(arr1[i]).find("td").toArray();
        for (j = 0; j < arr2.length; j++) {
          temp2 = {};
          if ($(arr2[j]).find("a").length > 0) {
            temp3 = [];
            arr3 = $(arr2[j]).find("a").toArray();
            for (k = 0; k < arr3.length; k++) {
              temp3.push({
                text: helper.formatString($(arr3[k]).text()),
                link: helper.formatLink(pageUrl, $(arr3[k]).attr("href")),
              });
            }
            temp2.value = temp3;
            temp2.type = "Link";
          } else {
            temp2.value = helper.formatString($(arr2[j]).text());
            temp2.type = "String";
          }

          temp3 = helper.formatString($(arr2[j]).attr("rowspan"));
          if (temp3) {
            temp2.rowspan = temp3;
          }
          temp3 = helper.formatString($(arr2[j]).attr("colspan"));
          if (temp3) {
            temp2.colspan = temp3;
          }

          temp1.push(temp2);
        }
        data.value.push(temp1);
      }
      data.type = "Table";
      break;
    default:
      data.value = helper.formatString($(elem).text());
      data.type = "String";
  }

  return data;
}

function getKey($, elem) {
  var data = {};

  data.key = helper.formatKey($(elem).text());

  return data;
}

function getSectionData($, childArr, i, pageUrl) {
  var data = {};
  var temp;
  var index;

  temp = getKey($, childArr[i]);
  Object.assign(data, temp);

  if (childArr[i + 1] !== undefined) {
    temp = getValueAndType($, childArr[i + 1], pageUrl);
    Object.assign(data, temp);
    index = i + 1; // skip row as it is already traversed by getValueAndType
  } else {
    index = i;
  }

  return { data: data, index: index };
}

function scrapJobDetail(html, url) {
  var $ = cheerio.load(html);

  var data = [];

  var temp;

  var i;

  var arr = [];

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

  arr = $(".td-post-content").children().toArray();
  for (i = 0; i < arr.length; i++) {
    var tag = helper.tagName($, arr[i]);
    if (tag === "H2" || tag === "H3") {
      temp = getSectionData($, arr, i, url);
      if (!helper.isDataEmpty(temp.data)) {
        data.push(temp.data);
      }
      i = temp.index;
    }
  }

  return data;
}

module.exports.scrapJobDetail = scrapJobDetail;
// Correctly-spelled alias; the old name stays for backwards compatibility.
module.exports.scrapeJobDetail = scrapJobDetail;
