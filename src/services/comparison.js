// Cross-store comparison from normalized product items. Adapted from v1 to v2's item shape:
// each item is { name_en, name_ur, brand, category, price_pkr, image, source_url, store_name, rating }.
const { group } = require('../scrapers/utils/productMatcher');

const storeOf = (it) => it.store_name || it.source_domain || 'Unknown';

function toEntry(item) {
  return {
    store_name: storeOf(item),
    price_pkr: item.price_pkr || 0,
    source_url: item.source_url || item.url || '',
    image_url: item.image || item.image_url || '',
    rating: item.rating ?? null,
    name_en: item.name_en || item.name || '',
    name_ur: item.name_ur || '',
    category: item.category || 'A',
  };
}

// Returns { primary, storeResults }:
//   primary      — largest cross-store cluster; entries cheapest-first + cheapest_store/savings/has_comparison
//   storeResults — cheapest item per store
function buildComparison(items) {
  if (!Array.isArray(items) || items.length === 0) return { primary: null, storeResults: [] };

  // storeResults: cheapest per store
  const byStore = new Map();
  for (const it of items) {
    const price = it.price_pkr || 0;
    if (price <= 0) continue;
    const s = storeOf(it);
    const cur = byStore.get(s);
    if (!cur || price < cur.price_pkr) byStore.set(s, toEntry(it));
  }
  const storeResults = [...byStore.values()];

  // primary: cluster spanning the most distinct stores, then most items
  const clusters = group(items, 'name_en');
  let best = null;
  let bestStores = 0;
  for (const c of clusters) {
    const stores = new Set(c.map(storeOf)).size;
    if (stores > bestStores || (stores === bestStores && (!best || c.length > best.length))) {
      best = c;
      bestStores = stores;
    }
  }
  if (!best) return { primary: null, storeResults };

  const entriesByStore = new Map();
  for (const it of best) {
    const price = it.price_pkr || 0;
    if (price <= 0) continue;
    const s = storeOf(it);
    const cur = entriesByStore.get(s);
    if (!cur || price < cur.price_pkr) entriesByStore.set(s, toEntry(it));
  }
  const comparisons = [...entriesByStore.values()].sort((a, b) => a.price_pkr - b.price_pkr);
  // TC-COMP-01 (UC-03): a comparison needs valid price data from 2+ distinct stores —
  // anything less is "incomplete" and shouldn't be shown as a comparison card.
  if (comparisons.length < 2) return { primary: null, storeResults };

  const head = best[0];
  const cheapest = comparisons[0];
  const highest = comparisons[comparisons.length - 1];

  const primary = {
    name_en: head.name_en || head.name || '',
    name_ur: head.name_ur || '',
    category: head.category || 'A',
    product_category: head.product_category || '',
    image_url: comparisons.find((c) => c.image_url)?.image_url || '',
    rating: head.rating ?? null,
    comparisons,
    cheapest_store: cheapest.store_name,
    has_comparison: comparisons.length > 1,
    savings: comparisons.length > 1 ? highest.price_pkr - cheapest.price_pkr : 0,
  };

  return { primary, storeResults };
}

module.exports = { buildComparison };
