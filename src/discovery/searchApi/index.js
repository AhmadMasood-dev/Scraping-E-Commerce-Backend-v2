// Provider-agnostic web-search router (mirrors src/llm/index.js). `searchWeb()` returns normalized
// links regardless of provider. Order: SEARCH_PRIMARY then SEARCH_FALLBACKS (env). On a quota/429 a
// provider's circuit opens until end-of-day so we skip it instead of retrying into the same wall.
const serpapi = require('./providers/serpapi');
const logger = require('../../config/logger');

// Only SerpApi for now; Serper is deferred (drop a serper.js here + add to SEARCH_FALLBACKS to re-enable).
const PROVIDERS = { serpapi };

const downUntil = Object.create(null);

function providerOrder() {
  const primary = (process.env.SEARCH_PRIMARY || 'serpapi').trim();
  const fallbacks = (process.env.SEARCH_FALLBACKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [primary, ...fallbacks].filter((p, i, a) => PROVIDERS[p] && a.indexOf(p) === i);
}

function isQuotaError(err) {
  return err?.status === 429 || err?.status === 503 || /quota|rate.?limit|exhaust/i.test(err?.message || '');
}

function endOfDay() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// searchWeb(query, { city?, num? }) → [{ url, title, snippet }]
async function searchWeb(query, opts = {}) {
  if (!query) throw new Error('searchWeb: query is required');
  const order = providerOrder();
  if (order.length === 0) throw new Error('searchWeb: no search providers configured');

  let lastErr;
  for (const id of order) {
    if (downUntil[id] && Date.now() < downUntil[id]) {
      logger.info(`[search] skip ${id} (circuit open)`);
      continue;
    }
    try {
      return await PROVIDERS[id].search(query, opts);
    } catch (err) {
      lastErr = err;
      if (isQuotaError(err)) {
        downUntil[id] = endOfDay();
        logger.warn(`[search] ${id} quota/429 → circuit open until EOD`);
      } else {
        logger.warn(`[search] ${id} failed: ${err.message}`);
      }
    }
  }
  throw new Error(`All search providers failed. Last error: ${lastErr?.message || 'unknown'}`);
}

function _resetCircuit() {
  for (const k of Object.keys(downUntil)) delete downUntil[k];
}

module.exports = { searchWeb, providerOrder, isQuotaError, PROVIDERS, _resetCircuit };
