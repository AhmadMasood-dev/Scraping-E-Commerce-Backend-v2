// Curated, hand-maintained seed of PK retailers with known physical branches — NOT scraped/live.
// Illustrative starting set; refine/extend as real branch data is confirmed.
const Store = require('../models/Store');
const logger = require('../config/logger');

const STORES = [
  { name: 'PriceOye', domain: 'priceoye.pk', cities_physical: ['lahore', 'karachi', 'islamabad'] },
  { name: 'Telemart', domain: 'telemart.pk', cities_physical: ['karachi'] },
  { name: 'Daraz', domain: 'daraz.pk', cities_physical: [] },
];

// Upsert by domain so newly-added stores appear without wiping the collection. $setOnInsert
// only sets fields on first insert — preserves any hand-edited cities_physical on existing docs.
async function seedStores() {
  let added = 0;
  for (const s of STORES) {
    const r = await Store.updateOne({ domain: s.domain }, { $setOnInsert: s }, { upsert: true });
    if (r.upsertedCount) added++;
  }
  if (added) logger.info(`[seed] Added ${added} new store(s)`);
  return added;
}

module.exports = { seedStores, STORES };
