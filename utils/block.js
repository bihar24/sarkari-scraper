"use strict";

// Recognise anti-bot, parked-domain, maintenance and error pages so callers
// do not turn a blocked/changed response into an empty but "successful"
// scrape. This is deliberately conservative: a page that merely has some
// matching text is not classified as a block page unless the signal is
// strong and no usable content was extracted.

var STRONG_BLOCK_PATTERNS = [
  /access denied/i,
  /\b403 forbidden\b/i,
  /\battention required\b/i,
  /\bblocked\b/i,
  /\bcaptcha/i,
  /\bcloudflare ray id\b/i,
  /\bforbidden\b/i,
  /\bjust a moment\b/i,
  /\bmaintenance mode/i,
  /\bnot found\b/i,
  /\boops! that page can',?t be found/i,
  /\bpage not found\b/i,
  /\bparked\b/i,
  /\bprotected by\b/i,
  /\bsorry, you have been blocked\b/i,
  /\bthis website is for sale\b/i,
  /\btoo many requests\b/i,
  /\bunavailable\b/i,
];

var WEAK_BLOCK_PATTERNS = [
  /\b503 service unavailable\b/i,
  /\bbot\b/i,
  /\bchallenge\b/i,
  /\bcloudflare\b/i,
  /\bdatadome\b/i,
  /\bincapsula\b/i,
  /\bservice is temporarily\b/i,
];

function normalize(html) {
  return String(html || "").replace(/\s+/g, " ");
}

function looksLikeBlockPage(html) {
  var text = normalize(html);
  var strong = STRONG_BLOCK_PATTERNS.filter(function (pattern) {
    return pattern.test(text);
  }).length;
  var weak = WEAK_BLOCK_PATTERNS.filter(function (pattern) {
    return pattern.test(text);
  }).length;
  // Two weak signals, or one strong signal, are enough to treat the page as
  // a block/error page. This avoids classifying ordinary job language that
  // mentions "captcha" or "bot" in an article body.
  return strong > 0 || weak >= 2;
}

// Short canonical URL/links tied to article slugs. Used to reject obvious
// navigation/footer/social links as if they were opportunities.
var NAVIGATION_HINTS = [
  /\/(about|about-us|contact|contact-us|disclaimer|privacy|privacy-policy|site-map|sitemap|terms|terms-of-service|author|category|tag|advertise|login|register|search)\/?$/i,
  /\bskip to content\b/i,
  /\bscroll back to top\b/i,
  /\bhome\b/i,
];

function looksLikeNavigation(anchor, text, href) {
  href = String(
    href || (anchor && anchor.attribs && anchor.attribs.href) || ""
  );
  text = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  href = href.toLowerCase();
  if (
    !href ||
    /^(?:https?:)?\/?#/.test(href) ||
    /(?:^|\/)(?:about|author|category|tag|contact|disclaimer|home|login|privacy|register|search|sitemap|terms)(?:[\/-]|$)/i.test(
      href
    ) ||
    /^(?:javascript|mailto|tel):/.test(href) ||
    /facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|t\.me|telegram|whatsapp|api\.|google\.com/i.test(
      href
    )
  ) {
    return true;
  }
  return NAVIGATION_HINTS.some(function (pattern) {
    return pattern.test(text);
  });
}

module.exports.looksLikeBlockPage = looksLikeBlockPage;
module.exports.looksLikeNavigation = looksLikeNavigation;
module.exports.NAVIGATION_HINTS = NAVIGATION_HINTS;
module.exports.STRONG_BLOCK_PATTERNS = STRONG_BLOCK_PATTERNS;
module.exports.WEAK_BLOCK_PATTERNS = WEAK_BLOCK_PATTERNS;
