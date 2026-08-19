// Background-only: best-effort Mongo upsert of formatted search-result items, tagging
// available_in_store from the curated Store.cities_physical lookup. Never blocks search
// (see Task 6 — always called via setImmediate, never awaited by the caller).
//
// store_name on items is inconsistent by source: a hostname like "priceoye.pk" from extracted
// links, or a display name like "Daraz" from direct sources (discovery/directSources.js:42).
// Match loosely on the domain's first label so both forms resolve to the same curated Store.
// The curated Store table is small (hand-seeded), so fetching all of it per item is cheap.
const Store = require('../models/Store');
const Product = require('../models/Product');
const logger = require('../config/logger');

function domainKey(s) {
  return String(s || '').toLowerCase().replace(/^www\./, '').split('.')[0];
}

async function findStore(storeName) {
  const key = domainKey(storeName);
  if (!key) return null;
  const stores = await Store.find({});
  return stores.find((s) => domainKey(s.domain) === key) || null;
}

async function upsertProduct(item, city) {
  const store = await findStore(item.store_name);
  const cityLc = String(city || '').toLowerCase();
  const available_in_store = !!(
    store && Array.isArray(store.cities_physical) && store.cities_physical.includes(cityLc)
  );

  await Product.findOneAndUpdate(
    { store_name: item.store_name, source_url: item.source_url },
    { $set: { ...item, available_in_store } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function upsertAll(items, city) {
  for (const item of items) {
    try {
      await upsertProduct(item, city);
    } catch (e) {
      logger.warn(`[persist] upsert failed for ${item.source_url}: ${e.message}`);
    }
  }
}

module.exports = { upsertProduct, upsertAll, findStore, domainKey };
