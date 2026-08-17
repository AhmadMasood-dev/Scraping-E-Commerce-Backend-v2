// Discovery orchestrator. Runs the two lanes in PARALLEL and returns:
//   links          — safe, deduped, capped result URLs (from the search API) → need fetch+extract
//   directProducts — pre-extracted products (from Daraz API) → skip fetch+extract
// Each lane is guarded, so one failing lane never sinks discovery (negative case #9).
const searchMod = require('./searchApi');
const directMod = require('./directSources');
const { filterLinks } = require('../extract/urlGuard');
const logger = require('../config/logger');

const CAP = 8;

async function safe(fn) {
  try {
    return await fn();
  } catch (e) {
    logger.warn(`[discovery] lane failed: ${e.message}`);
    return [];
  }
}

async function discover(query, opts = {}) {
  const [rawLinks, directProducts] = await Promise.all([
    safe(() => searchMod.searchWeb(query, opts)),
    safe(() => directMod.getDarazProducts(query, opts)),
  ]);

  const seen = new Set();
  const links = [];
  for (const l of filterLinks(rawLinks)) {
    const url = typeof l === 'string' ? l : l && l.url;
    if (!url) continue;
    let host;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (host === 'daraz.pk' || host.endsWith('.daraz.pk')) continue; // covered by directProducts
    if (seen.has(url)) continue;
    seen.add(url);
    links.push(typeof l === 'string' ? { url } : l);
    if (links.length >= CAP) break;
  }

  return { links, directProducts };
}

module.exports = { discover, CAP };
