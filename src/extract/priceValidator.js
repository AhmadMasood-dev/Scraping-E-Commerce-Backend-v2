// Validate + normalize prices to a positive integer PKR, or null if unusable.
// Guards the graded comparison — a wrong price makes "cheapest" lie.
const MIN = 100; // plausible PKR product floor (drops "50", "0", tiny junk)
const MAX = 20_000_000; // ceiling (drops absurd values)

function parseNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const s = String(v);
  if (/\b(call|contact|ask|tbd|n\/a)\b/i.test(s)) return null; // "Call for price"
  const digits = s.replace(/[^0-9.]/g, '');
  if (!digits || digits === '.') return null;
  const n = Math.round(parseFloat(digits));
  return Number.isFinite(n) ? n : null;
}

function inRange(n) {
  return typeof n === 'number' && n >= MIN && n <= MAX;
}

// PKR or unspecified (assume PKR on .pk sites); reject explicit non-PKR.
function currencyOk(cur) {
  if (!cur) return true;
  return /^(pkr|rs|₨|rupee|pak)/i.test(String(cur).trim());
}

// Validate a plain price value (+ optional currency) → int PKR or null.
function validatePrice(value, currency) {
  if (!currencyOk(currency)) return null;
  const n = parseNumber(value);
  return inRange(n) ? n : null;
}

// Extract the best valid PKR price from a JSON-LD `offers` value (object | array | AggregateOffer).
function priceFromOffers(offers) {
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  const candidates = [];
  for (const o of list) {
    if (!o || typeof o !== 'object') {
      const n = parseNumber(o);
      if (inRange(n)) candidates.push(n);
      continue;
    }
    if (!currencyOk(o.priceCurrency)) continue;
    const type = String(o['@type'] || '');
    if (/AggregateOffer/i.test(type) || o.lowPrice != null) {
      const n = parseNumber(o.lowPrice != null ? o.lowPrice : o.price);
      if (inRange(n)) candidates.push(n);
      continue;
    }
    if (o.availability && /OutOfStock|SoldOut|Discontinued/i.test(String(o.availability))) continue;
    const n = parseNumber(o.price);
    if (inRange(n)) candidates.push(n);
  }
  return candidates.length ? Math.min(...candidates) : null;
}

module.exports = { validatePrice, priceFromOffers, parseNumber, inRange, MIN, MAX };
