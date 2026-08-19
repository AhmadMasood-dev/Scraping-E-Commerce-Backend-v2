// Cluster scraped items that are "the same product" across stores, by title
// similarity. Uses an inline Dice coefficient (bigram overlap) — no external
// dependency. Ported from the old project's productMatcher.

const SIMILARITY_THRESHOLD = 0.6;

function normalize(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Dice coefficient on character bigrams → 0..1
function diceSimilarity(a, b) {
  const s1 = normalize(a);
  const s2 = normalize(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1 : 0;

  const bigrams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.substr(i, 2);
      m.set(bg, (m.get(bg) || 0) + 1);
    }
    return m;
  };

  const b1 = bigrams(s1);
  const b2 = bigrams(s2);
  let intersection = 0;
  for (const [bg, count] of b1) {
    if (b2.has(bg)) intersection += Math.min(count, b2.get(bg));
  }
  return (2 * intersection) / (s1.length - 1 + (s2.length - 1));
}

// Storage/RAM capacity tokens in a title (e.g. "256GB", "8GB") — the one variant dimension that
// directly changes fair price. Dice-bigram similarity alone can't tell "...256GB Storage" from
// "...512GB Storage" apart (they share almost every bigram), so two titles are only allowed to
// cluster as "the same product" when their capacity-token sets don't conflict (#11).
function variantTokens(title) {
  const matches = String(title || '').toUpperCase().match(/\d+\s?(?:GB|TB|MB)\b/g) || [];
  return new Set(matches.map((t) => t.replace(/\s+/g, '')));
}

// True unless both titles mention capacity and disagree on which. If only one (or neither)
// title mentions capacity, we can't tell — don't block the cluster on a guess.
function variantsCompatible(a, b) {
  const ta = variantTokens(a);
  const tb = variantTokens(b);
  if (ta.size === 0 || tb.size === 0) return true;
  if (ta.size !== tb.size) return false;
  for (const t of ta) if (!tb.has(t)) return false;
  return true;
}

// Group items by title similarity. Each item is matched against the first
// member of existing groups; otherwise it starts a new group.
// titleField lets callers cluster on name_en (classified) or name (raw).
function group(items, titleField = 'name_en') {
  const groups = [];
  for (const item of items) {
    const title = item[titleField] || item.name_en || item.name || item.title || '';
    let matched = false;
    for (const g of groups) {
      const gTitle = g[0][titleField] || g[0].name_en || g[0].name || g[0].title || '';
      if (diceSimilarity(title, gTitle) >= SIMILARITY_THRESHOLD && variantsCompatible(title, gTitle)) {
        g.push(item);
        matched = true;
        break;
      }
    }
    if (!matched) groups.push([item]);
  }
  return groups;
}

module.exports = { group, diceSimilarity, normalize, SIMILARITY_THRESHOLD, variantTokens, variantsCompatible };
