// Timeframe decay for reviews — older reviews count for less. Ported near-verbatim from v1
// (backend/src/services/reviewDecay.js) — pure, zero-dep, nothing v1-specific to change.
//
//   < 6 months   → weight 1.0  (within_timeframe: true)
//   6–18 months  → weight 0.7  (within_timeframe: true)
//   > 18 months  → weight 0.4  (within_timeframe: false)

const SIX_MONTHS_DAYS = 182;
const EIGHTEEN_MONTHS_DAYS = 548;

function ageInDays(reviewDate, now = new Date()) {
  const then = reviewDate instanceof Date ? reviewDate : new Date(reviewDate);
  const ms = now.getTime() - then.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function decayFor(reviewDate, now = new Date()) {
  const days = ageInDays(reviewDate, now);
  if (isNaN(days)) return { weight: 0.4, within_timeframe: false };
  if (days < SIX_MONTHS_DAYS) return { weight: 1.0, within_timeframe: true };
  if (days < EIGHTEEN_MONTHS_DAYS) return { weight: 0.7, within_timeframe: true };
  return { weight: 0.4, within_timeframe: false };
}

function aggregateScore(reviews, now = new Date()) {
  if (!Array.isArray(reviews) || reviews.length === 0) return null;

  let weightedSum = 0;
  let weightTotal = 0;
  for (const r of reviews) {
    if (typeof r.score !== 'number') continue;
    const { weight } = decayFor(r.review_date, now);
    weightedSum += r.score * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) return null;
  return Math.round((weightedSum / weightTotal) * 10) / 10;
}

module.exports = { decayFor, aggregateScore, ageInDays, SIX_MONTHS_DAYS, EIGHTEEN_MONTHS_DAYS };
