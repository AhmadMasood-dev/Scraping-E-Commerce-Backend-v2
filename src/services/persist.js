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
const db = require('../config/db');

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
    { upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

// resolveIds(items): for each item, reuse the existing Product's _id (by store_name+source_url) if
// one exists, else mint a fresh id client-side — so the search response can include a stable,
// real _id immediately, before the background upsert (which reuses these same ids) ever runs.
// See docs/plans/2026-08-20-phase-6c-review-engine-design.md §3 for the full timing reasoning.
// Gracefully returns items unchanged (no _id) when Mongo isn't connected.
async function resolveIds(items) {
  if (db.mongoose.connection.readyState !== 1) return items;
  if (!items.length) return items;

  const existing = await Product.find(
    { $or: items.map((it) => ({ store_name: it.store_name, source_url: it.source_url })) },
    { store_name: 1, source_url: 1 }
  );
  const key = (storeName, sourceUrl) => `${storeName}::${sourceUrl}`;
  const byKey = new Map(existing.map((doc) => [key(doc.store_name, doc.source_url), doc._id]));

  return items.map((it) => ({
    ...it,
    _id: byKey.get(key(it.store_name, it.source_url)) || new db.mongoose.Types.ObjectId(),
  }));
}

async function upsertAll(items, city) {
  if (db.mongoose.connection.readyState !== 1) return; // ponytail: no live Mongo connection, nothing to persist
  for (const item of items) {
    try {
      await upsertProduct(item, city);
    } catch (e) {
      logger.warn(`[persist] upsert failed for ${item.source_url}: ${e.message}`);
    }
  }
}

module.exports = { upsertProduct, upsertAll, findStore, domainKey, resolveIds };
