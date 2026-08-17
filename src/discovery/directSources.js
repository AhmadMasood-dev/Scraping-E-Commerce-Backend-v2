// Direct source: Daraz public JSON search. Unlike search-API links, this returns FULL products,
// so they skip fetch+extract and go straight into the pipeline as ProductDrafts. Zero-dep; [] on error.
const { validatePrice } = require('../extract/priceValidator');
const logger = require('../config/logger');

const SEARCH = 'https://www.daraz.pk/catalog/?ajax=true&isFirstRequest=true&page=1';

// Daraz urls are often protocol-relative (//host/…) or root-relative (/…).
function normUrl(u) {
  if (!u) return '';
  if (u.startsWith('//')) return `https:${u}`;
  if (u.startsWith('/')) return `https://www.daraz.pk${u}`;
  return u;
}

async function getDarazProducts(query, { maxResults = 15, timeoutMs = 15000 } = {}) {
  try {
    const res = await fetch(`${SEARCH}&q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.daraz.pk/',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items = (data && data.mods && data.mods.listItems) || [];

    const out = [];
    for (const it of items.slice(0, maxResults)) {
      const source_url = normUrl(it.itemUrl || it.productUrl);
      const price_pkr = validatePrice(it.price || it.priceShow);
      if (!source_url || price_pkr == null) continue;
      out.push({
        url: source_url,
        name: String(it.name || it.brandName || '').trim(),
        price_pkr,
        image: normUrl(it.image),
        description: '',
        source_url,
        store_name: 'Daraz',
        rating: parseFloat(it.ratingScore) || null,
        review_count: it.review != null ? Number(it.review) : null,
        reviews: [],
        source: 'daraz',
      });
    }
    logger.info(`[Daraz] "${query}" → ${out.length} products`);
    return out;
  } catch (e) {
    logger.warn(`[Daraz] ${e.message}`);
    return [];
  }
}

module.exports = { getDarazProducts };
