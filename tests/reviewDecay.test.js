process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const { decayFor, aggregateScore } = require('../src/services/reviewDecay');

const daysAgo = (n, now) => new Date(now.getTime() - n * 86400000);

test('decayFor: under 6 months → weight 1.0, within_timeframe true', () => {
  const now = new Date('2026-08-20T00:00:00Z');
  const { weight, within_timeframe } = decayFor(daysAgo(30, now), now);
  assert.equal(weight, 1.0);
  assert.equal(within_timeframe, true);
});

test('decayFor: 6-18 months → weight 0.7, within_timeframe true', () => {
  const now = new Date('2026-08-20T00:00:00Z');
  const { weight, within_timeframe } = decayFor(daysAgo(300, now), now);
  assert.equal(weight, 0.7);
  assert.equal(within_timeframe, true);
});

test('decayFor: over 18 months → weight 0.4, within_timeframe false', () => {
  const now = new Date('2026-08-20T00:00:00Z');
  const { weight, within_timeframe } = decayFor(daysAgo(600, now), now);
  assert.equal(weight, 0.4);
  assert.equal(within_timeframe, false);
});

test('decayFor: unknown/invalid date → treated as old (0.4, false)', () => {
  const { weight, within_timeframe } = decayFor(null);
  assert.equal(weight, 0.4);
  assert.equal(within_timeframe, false);
});

test('aggregateScore: weighted average across mixed-age reviews', () => {
  const now = new Date('2026-08-20T00:00:00Z');
  const reviews = [
    { score: 5, review_date: daysAgo(30, now) },
    { score: 1, review_date: daysAgo(600, now) },
  ];
  // (5*1.0 + 1*0.4) / (1.0 + 0.4) = 3.857... → rounds to 3.9
  assert.equal(aggregateScore(reviews, now), 3.9);
});

test('aggregateScore: empty array → null', () => {
  assert.equal(aggregateScore([]), null);
});

test('aggregateScore: ignores entries with non-numeric score', () => {
  const now = new Date('2026-08-20T00:00:00Z');
  const reviews = [{ score: 'bad', review_date: daysAgo(10, now) }, { score: 4, review_date: daysAgo(10, now) }];
  assert.equal(aggregateScore(reviews, now), 4);
});
