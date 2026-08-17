// Trimmed, zero-dependency NLP (no compromise / franc). Language detect + Roman-Urdu→English
// transliteration + simple keywords. `normalized` is the CLEANED query (not keyword-mangled — v1's
// keyword-join produced junk like "iphone 15 pro max pro"). Urdu-script → English is deferred to the LLM.
const logger = require('../config/logger');

const romanUrduDict = {
  mujhe: '', mujhay: '', chahiye: '', chahye: '', chahyee: '',
  hai: '', hay: '', ka: '', ki: '', ke: '', ko: '', se: '', mein: '', kuch: '',
  sasta: 'cheap', sastay: 'cheap', sasti: 'cheap',
  mehnga: 'expensive', mehngi: 'expensive',
  acha: 'good', achi: 'good', achay: 'good',
  naya: 'new', nai: 'new', nayi: 'new', purana: 'old', purani: 'old',
  bara: 'big', bari: 'big', chota: 'small', choti: 'small',
  mobile: 'smartphone', mobail: 'smartphone', phone: 'smartphone',
  laptop: 'laptop', computer: 'computer',
  joota: 'shoes', jootay: 'shoes', jootian: 'shoes',
  kapde: 'clothes', kapra: 'clothes', kapray: 'clothes',
  ghari: 'watch', gharian: 'watches',
  ghar: 'house', makaan: 'house', gari: 'car', gaari: 'car',
  chai: 'tea', cheeni: 'sugar', doodh: 'milk', pani: 'water', tel: 'oil',
};

const ROMAN_URDU_HINTS = new Set([
  'mujhe', 'chahiye', 'chahye', 'sasta', 'mehnga', 'acha', 'naya', 'kapde',
  'joota', 'ghari', 'mobail', 'gari', 'cheeni', 'doodh', 'pani', 'ghar',
]);

const URDU_RANGE = /[؀-ۿ]/;
const STOP = new Set(['the', 'a', 'an', 'for', 'with', 'and', 'or', 'of', 'in', 'to']);

function detectLanguage(text) {
  const s = String(text || '');
  if (URDU_RANGE.test(s)) return 'ur';
  const tokens = s.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = tokens.filter((t) => ROMAN_URDU_HINTS.has(t)).length;
  if (hits >= 1 && tokens.length <= 8) return 'ro';
  return 'en';
}

function transliterateRoman(text) {
  return String(text || '')
    .split(/\s+/)
    .map((w) => {
      const k = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      return romanUrduDict[k] !== undefined ? romanUrduDict[k] : w;
    })
    .filter((w) => w !== '')
    .join(' ')
    .trim();
}

function extractKeywords(text) {
  return [
    ...new Set(
      String(text || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t && !STOP.has(t))
    ),
  ];
}

async function processQuery(raw, langHint) {
  const original = String(raw || '').trim();
  if (!original) return { original: '', language: 'en', translated: '', keywords: [], normalized: '' };

  const language = langHint || detectLanguage(original);
  let translated = original;
  if (language === 'ro' || language === 'ur') {
    translated = transliterateRoman(original);
    if (language === 'ur') logger.info(`[NLP] Urdu-script transliteration (LLM translates later): "${original}"`);
  }
  const normalized = translated.toLowerCase().replace(/\s+/g, ' ').trim();
  return { original, language, translated, keywords: extractKeywords(translated), normalized };
}

module.exports = { processQuery, detectLanguage };
