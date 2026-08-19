// The full v2 search pipeline (pure orchestration — the Express handler just calls this).
// NLP → cache → discover → parallel fetch+extract(links) + directProducts → relevance → normalize →
// comparison → group A/B/C/D → payload. Response shape matches the existing frontend.
const { processQuery } = require('../nlp/processor');
const cache = require('../config/cache');
const disc = require('../discovery');
const fetchMod = require('../extract/fetchPage');
const extractMod = require('../extract');
const { filterRelevant } = require('../scrapers/utils/relevance');
const normMod = require('./normalize');
const { buildComparison } = require('./comparison');
const persistMod = require('./persist');
const similarMod = require('./similar');
const logger = require('../config/logger');

const CATS = ['A', 'B', 'C', 'D'];
const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

async function extractFromLink(link) {
  try {
    const { finalUrl, html } = await fetchMod.fetchPage(link.url);
    const draft = await extractMod.extractProduct(finalUrl, html);
    if (!draft) return null;
    return {
      ...draft,
      store_name: draft.store_name || hostOf(finalUrl),
      source_url: draft.source_url || finalUrl,
      url: finalUrl,
    };
  } catch (e) {
    logger.warn(`[search] link failed ${link.url}: ${e.message}`);
    return null;
  }
}

function format(it) {
  return {
    name_en: it.name_en || it.name || '',
    name_ur: it.name_ur || '',
    brand: it.brand || '',
    price_pkr: it.price_pkr || 0,
    image_url: it.image || it.image_url || '',
    source_url: it.source_url || it.url || '',
    store_name: it.store_name || '',
    category: CATS.includes(it.category) ? it.category : 'A',
    product_category: it.product_category || '',
    rating: it.rating ?? null,
  };
}

async function runSearch({ query, description = '', city = 'islamabad', lang } = {}) {
  const start = Date.now();
  const q = [query, description].filter(Boolean).join(' ').trim();
  if (!q || q.length < 2) return { error: 'Query must be at least 2 characters' };

  const nlp = await processQuery(q, lang);
  const cacheKey = `search:${nlp.normalized}:${String(city).toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit) return { ...hit, cached: true };

  const { links, directProducts } = await disc.discover(nlp.normalized, { city });
  const partial = links.length === 0 && directProducts.length === 0;

  const settled = await Promise.allSettled(links.map(extractFromLink));
  const extracted = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);

  const rawItems = [...directProducts, ...extracted];
  const relevant = filterRelevant(rawItems, nlp.normalized);

  const storesSearched = new Set(
    [...links.map((l) => hostOf(l.url)), ...directProducts.map((p) => p.store_name)].filter(Boolean)
  ).size;
  const baseMeta = { city, language: nlp.language, stores_searched: storesSearched, partial };

  if (relevant.length === 0) {
    // empty → return but DO NOT cache
    return { cached: false, results: { A: [], B: [], C: [], D: [] }, primary: null, storeResults: [], meta: { ...baseMeta, total: 0, durationMs: Date.now() - start } };
  }

  const items = await normMod.normalizeProducts(relevant);
  const { primary, storeResults } = buildComparison(items);

  if (primary) {
    primary.similar = await similarMod.findSimilar({
      product_category: primary.product_category,
      category: primary.category,
      price_pkr: primary.comparisons[0].price_pkr,
      excludeUrls: primary.comparisons.map((c) => c.source_url),
    });
  }

  const results = { A: [], B: [], C: [], D: [] };
  const formatted = [];
  for (const it of items) {
    const f = format(it);
    formatted.push(f);
    results[CATS.includes(it.category) ? it.category : 'A'].push(f);
  }

  const payload = {
    cached: false,
    results,
    primary,
    storeResults,
    meta: { ...baseMeta, total: items.length, durationMs: Date.now() - start },
  };
  cache.set(cacheKey, payload); // cache only non-empty

  setImmediate(() => {
    persistMod.upsertAll(formatted, city).catch((e) => logger.warn(`[search] background persist failed: ${e.message}`));
  });

  return payload;
}

module.exports = { runSearch };
