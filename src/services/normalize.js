// Batched normalize: raw ProductDrafts → clean, comparable, translated, categorized items in ONE LLM
// call. Enriches (name_en/name_ur/brand/category/product_category) but NEVER touches price (already
// validated). Graceful: on LLM failure/invalid output it retries once then falls back to passthrough
// so search keeps working.
const llm = require('../llm');
const logger = require('../config/logger');

const CATS = new Set(['A', 'B', 'C', 'D']);

function passthrough(drafts) {
  return drafts.map((d) => ({
    ...d,
    name_en: d.name_en || d.name || '',
    name_ur: d.name_ur || '',
    brand: d.brand || '',
    category: CATS.has(d.category) ? d.category : 'A',
    product_category: d.product_category || '',
  }));
}

function buildPrompt(drafts) {
  const list = drafts.map((d, i) => ({
    i,
    name: d.name || d.name_en || '',
    store: d.store_name || d.source_domain || '',
  }));
  return (
    'Normalize these Pakistani online-store product listings. For EACH item return an object ' +
    '{"i": number, "name_en": clean product name, "name_ur": Urdu translation of name_en, ' +
    '"brand": brand, "category": "A"|"B"|"C"|"D", "product_category": short product-type label ' +
    '(e.g. "Mobile Phones", "Laptops", "Fashion")} where A=generic marketplace, B=niche/specialist ' +
    'store, C=single-brand store, D=blog/review site (classify by the store). ' +
    'Return ONLY a JSON object {"items": [ ... ]}.\n' +
    JSON.stringify(list)
  );
}

// Merge the LLM's items array back onto drafts by index. Returns null if incomplete/invalid.
function mergeByIndex(drafts, items) {
  if (!Array.isArray(items)) return null;
  const byI = new Map();
  for (const o of items) if (o && typeof o.i === 'number') byI.set(o.i, o);

  const out = drafts.map((d, i) => {
    const o = byI.get(i);
    if (!o) return null;
    return {
      ...d,
      name_en: (o.name_en && String(o.name_en).trim()) || d.name || '',
      name_ur: o.name_ur ? String(o.name_ur).trim() : '',
      brand: o.brand ? String(o.brand).trim() : d.brand || '',
      category: CATS.has(o.category) ? o.category : 'A',
      product_category: o.product_category ? String(o.product_category).trim() : d.product_category || '',
    };
  });
  return out.some((x) => x === null) ? null : out;
}

async function normalizeProducts(drafts) {
  if (!Array.isArray(drafts) || drafts.length === 0) return [];

  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await llm.runLLM({
        system: 'You normalize e-commerce product data. Return ONLY a JSON object.',
        prompt: buildPrompt(drafts),
        json: true,
      });
    } catch (e) {
      logger.warn(`[normalize] LLM failed (attempt ${attempt + 1}): ${e.message}`);
      continue;
    }
    const merged = mergeByIndex(drafts, res && res.items);
    if (merged) return merged;
    logger.warn(`[normalize] incomplete/invalid output (attempt ${attempt + 1})`);
  }

  logger.warn('[normalize] passthrough (LLM unavailable/invalid)');
  return passthrough(drafts);
}

module.exports = { normalizeProducts, passthrough };
