process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const Review = require('../src/models/Review');

const base = () => ({
  product_id: new mongoose.Types.ObjectId(),
  source: 'blog_sentiment',
  score: 4,
});

test('valid review passes validation', () => {
  const r = new Review(base());
  assert.equal(r.validateSync(), undefined);
});

test('missing required fields fail validation', () => {
  const r = new Review({});
  const err = r.validateSync();
  assert.ok(err.errors.product_id);
  assert.ok(err.errors.source);
  assert.ok(err.errors.score);
});

test('source must be blog_sentiment', () => {
  const r = new Review({ ...base(), source: 'user_review' });
  const err = r.validateSync();
  assert.ok(err.errors.source);
});

test('score must be within 0-5', () => {
  const tooHigh = new Review({ ...base(), score: 6 });
  assert.ok(tooHigh.validateSync().errors.score);
  const tooLow = new Review({ ...base(), score: -1 });
  assert.ok(tooLow.validateSync().errors.score);
});

test('optional fields default sanely', () => {
  const r = new Review(base());
  assert.equal(r.review_text, '');
  assert.equal(r.review_date, null);
  assert.equal(r.blog_url, '');
  assert.equal(r.timeframe_weight, 1.0);
  assert.equal(r.within_timeframe, true);
});
