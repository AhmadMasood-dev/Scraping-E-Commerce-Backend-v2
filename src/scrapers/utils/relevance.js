// Post-search relevance filter. Stores' own search engines return loosely-matched
// junk (base models, wrong variants, accessories) for a specific query like
// "iphone 15 pro max". We can't stop that at the source, so we filter what comes
// back: keep only titles that contain every significant query token and aren't an
// unrequested accessory (cover/case/glass/…).
//
// Optimised: query is tokenised once; each item is one Set-membership pass O(tokens).

// Words that carry no product identity — dropped from the query token set so they
// aren't required in titles.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'with', 'and', 'or', 'of', 'in', 'to', 'new', 'original',
  'pk', 'pakistan', 'price', 'buy', 'online',
]);

// Accessory terms. If a title contains one of these and the QUERY did not ask for
// it, the item is an accessory for the product, not the product → drop it.
const ACCESSORY = new Set([
  'cover', 'case', 'cases', 'casing', 'pouch', 'skin', 'sleeve',
  'glass', 'tempered', 'protector', 'screenguard', 'screen',
  'cable', 'charger', 'adapter', 'dock', 'stand', 'holder', 'mount',
  'strap', 'band', 'lens', 'sticker', 'film',
]);

// A capacity token (256GB, 512GB, ...) is a strong signal the title is describing an actual
// device, not a standalone accessory — real stores bundle a free case/adapter into a genuine
// phone listing's title ("iPhone 17 Pro Max - 256GB + 20W Power Adapter & Silicone Case"),
// which would otherwise look identical to a pure accessory listing to rule 2 below.
const HAS_CAPACITY_TOKEN = /\d+\s?(?:gb|tb|mb)\b/i;

// title → array of normalised word tokens (lowercase, punctuation stripped).
function tokenize(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Significant query tokens = tokens minus stopwords (and 1-char noise, except digits
// so a model number like "8" survives).
function queryTokens(query) {
  return tokenize(query).filter((t) => !STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t)));
}

// Keep only items whose title matches the query. `titleField` is the scraper's raw
// title field (default `name`).
//
// Requires EVERY significant query token to appear in the title. This is deliberately
// strict: it separates "15 Pro Max" from "15 Pro" and "17 Pro Max" (variant precision),
// which is the whole point. A majority-match was tried and rejected — it can't tell a
// dropped brand word ("iphone") from a dropped variant word ("max") without a product
// taxonomy, so it leaked wrong variants. Precision beats the rare abbreviated title.
// ponytail: if real searches over-filter (store omits a token we require), revisit here.
function filterRelevant(items, query, titleField = 'name') {
  if (!Array.isArray(items) || items.length === 0) return items;

  const qTokens = queryTokens(query);
  if (qTokens.length === 0) return items; // nothing meaningful to match on → don't filter

  const qSet = new Set(qTokens);

  return items.filter((item) => {
    // 0. Completeness gate: only save items we can actually show/compare — need an image and a price.
    if (!item.image) return false;
    if (!(item.price_pkr > 0)) return false;

    const tSet = new Set(tokenize(item[titleField] || item.name || item.title));

    // 1. Every significant query token must appear in the title.
    for (const q of qTokens) if (!tSet.has(q)) return false;

    // 2. Reject accessories the query didn't ask for — unless the title has a capacity
    //    token, which means it's a real device bundled with a free accessory, not the
    //    accessory itself.
    const title = item[titleField] || item.name || item.title || '';
    if (!HAS_CAPACITY_TOKEN.test(title)) {
      for (const t of tSet) if (ACCESSORY.has(t) && !qSet.has(t)) return false;
    }

    return true;
  });
}

module.exports = { filterRelevant, tokenize, queryTokens, ACCESSORY, STOPWORDS };
