// Provider-agnostic LLM router. `runLLM()` returns the same result regardless of which model answered.
// Order: LLM_PRIMARY then LLM_FALLBACKS (env). On a quota/429 error a provider's circuit opens until
// end-of-day so we skip it for the rest of the day instead of retrying into the same wall.
const gemini = require('./providers/gemini');
const groq = require('./providers/groq');
const logger = require('../config/logger');
const { createLimiter } = require('../config/limiter');

// Caps concurrent outbound LLM calls *across simultaneous searches* (#12) — normalize.js and
// llmExtract.js both go through runLLM, so this one limiter covers every LLM call site.
const limitLLM = createLimiter(3);

// LLM providers. Chain: Gemini (free, primary) → Groq (free, fallback). Claude was removed for now;
// re-adding a provider is just a new file here + its id in LLM_FALLBACKS.
const PROVIDERS = { gemini, groq };

// Circuit-breaker state: provider id → timestamp it's "down until".
const downUntil = Object.create(null);

function providerOrder() {
  const primary = (process.env.LLM_PRIMARY || 'gemini').trim();
  const fallbacks = (process.env.LLM_FALLBACKS || 'groq')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // dedupe, keep only known providers, primary first
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

// Strip ```json fences some models add, then JSON.parse.
function parseJson(text) {
  const cleaned = String(text)
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  return JSON.parse(cleaned);
}

// runLLM({ system?, prompt, json?, model? }) → text, or parsed object when json:true.
async function runLLM({ system, prompt, json = false, model } = {}) {
  if (!prompt) throw new Error('runLLM: prompt is required');
  const order = providerOrder();
  if (order.length === 0) throw new Error('runLLM: no LLM providers configured');

  let lastErr;
  for (const id of order) {
    if (downUntil[id] && Date.now() < downUntil[id]) {
      logger.info(`[llm] skip ${id} (circuit open)`);
      continue;
    }
    try {
      const text = await limitLLM(() => PROVIDERS[id].call({ system, prompt, json, model }));
      return json ? parseJson(text) : text;
    } catch (err) {
      lastErr = err;
      if (isQuotaError(err)) {
        downUntil[id] = endOfDay();
        logger.warn(`[llm] ${id} quota/429 → circuit open until EOD`);
      } else {
        logger.warn(`[llm] ${id} failed: ${err.message}`);
      }
    }
  }
  throw new Error(`All LLM providers failed. Last error: ${lastErr?.message || 'unknown'}`);
}

// Test/inspection helpers.
function _resetCircuit() {
  for (const k of Object.keys(downUntil)) delete downUntil[k];
}

module.exports = { runLLM, providerOrder, isQuotaError, parseJson, PROVIDERS, _resetCircuit };
