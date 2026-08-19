// Reader-side: "similar items" attached to a search response's `primary`, drawn from the
// persisted Product collection (past searches too, not just the current ~10 results) — see
// searchPipeline.js. Degrades to [] whenever Mongo isn't connected or the query fails, same
// as persist.js's guard, so it never breaks the response it's attached to.
//
// Matches on product_category (the real product-type label) when available; falls back to
// category (A/B/C/D, source-trust tier) since product_category is often empty until the LLM
// normalize step is fully working. Does NOT expose available_in_store — that field is known
// city-ambiguous (see phase-6a-schema.md); this is its first reader, and it shouldn't be
// trusted yet.
const Product = require('../models/Product');
const db = require('../config/db');
const logger = require('../config/logger');

function toEntry(doc) {
  return {
    name_en: doc.name_en || '',
    name_ur: doc.name_ur || '',
    brand: doc.brand || '',
    price_pkr: doc.price_pkr || 0,
    image_url: doc.image_url || '',
    source_url: doc.source_url || '',
    store_name: doc.store_name || '',
    category: doc.category || 'A',
    product_category: doc.product_category || '',
    rating: doc.rating ?? null,
  };
}

async function findSimilar({ product_category, category, price_pkr, excludeUrls = [] }, limit = 6) {
  if (db.mongoose.connection.readyState !== 1) return [];

  const filter = product_category
    ? { product_category, source_url: { $nin: excludeUrls } }
    : { category, source_url: { $nin: excludeUrls } };

  try {
    const docs = await Product.find(filter).lean();
    return docs
      .sort((a, b) => Math.abs(a.price_pkr - price_pkr) - Math.abs(b.price_pkr - price_pkr))
      .slice(0, limit)
      .map(toEntry);
  } catch (e) {
    logger.warn(`[similar] query failed: ${e.message}`);
    return [];
  }
}

module.exports = { findSimilar };
