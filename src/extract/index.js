// Extraction orchestrator. structured-data-first (free), LLM only on a gap. This is also the generic
// "is it a product?" gate: a page that yields no name+price returns null (dropped from results).
const { extractStructured } = require('./structured');
const llmMod = require('./llmExtract');
const logger = require('../config/logger');

// extractProduct(url, html) → ProductDraft | null
async function extractProduct(url, html) {
  const s = extractStructured(url, html);

  if (s && s.listing) {
    logger.info(`[extract] listing page skipped: ${url}`);
    return null;
  }
  if (s && s.name && s.price_pkr != null) return s; // structured success

  const llmed = await llmMod.llmExtract(url, html); // gap → LLM fallback
  if (llmed) return llmed;

  logger.info(`[extract] no product found: ${url}`);
  return null;
}

module.exports = { extractProduct };
