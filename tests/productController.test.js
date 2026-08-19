process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const Product = require('../src/models/Product');
const reviewEngineMod = require('../src/services/reviewEngine');
const db = require('../src/config/db');
const { getProduct } = require('../src/controllers/product');

const origFindById = Product.findById;
const origGetReviews = reviewEngineMod.getReviews;
beforeEach(() => {
  Product.findById = origFindById;
  reviewEngineMod.getReviews = origGetReviews;
  db.mongoose.connection.readyState = 1;
});

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('400 for an invalid id format', async () => {
  const res = mockRes();
  await getProduct({ params: { id: 'not-an-id' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test('404 when the product does not exist', async () => {
  const validId = new db.mongoose.Types.ObjectId().toString();
  Product.findById = () => ({ lean: async () => null });
  const res = mockRes();
  await getProduct({ params: { id: validId } }, res);
  assert.equal(res.statusCode, 404);
});

test('200 with product + reviews for a valid, existing product', async () => {
  const validId = new db.mongoose.Types.ObjectId().toString();
  Product.findById = () => ({ lean: async () => ({ _id: validId, name_en: 'iPhone 16' }) });
  reviewEngineMod.getReviews = async () => ({ type: 'blog_sentiment', aggregate_score: 4.5, count: 1, reviews: [] });
  const res = mockRes();
  await getProduct({ params: { id: validId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.product.name_en, 'iPhone 16');
  assert.equal(res.body.reviews.aggregate_score, 4.5);
});

test('503 when Mongo is not connected', async () => {
  db.mongoose.connection.readyState = 0;
  const validId = new db.mongoose.Types.ObjectId().toString();
  const res = mockRes();
  await getProduct({ params: { id: validId } }, res);
  assert.equal(res.statusCode, 503);
});

test('a slow getReviews (past the deadline) still yields a 200 with the empty shape, not a hang', async () => {
  const validId = new db.mongoose.Types.ObjectId().toString();
  Product.findById = () => ({ lean: async () => ({ _id: validId, name_en: 'Slow Product' }) });
  reviewEngineMod.getReviews = () => new Promise(() => {}); // never resolves — simulates a stuck scrape

  // Fire the race's deadline timer immediately instead of waiting the real 25s, so this test stays fast
  // and deterministic while still exercising the real Promise.race code path in product.js.
  const origSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => origSetTimeout(fn, 0);
  try {
    const res = mockRes();
    await getProduct({ params: { id: validId } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.reviews, { type: 'none', aggregate_score: null, count: 0, reviews: [] });
  } finally {
    global.setTimeout = origSetTimeout;
  }
});

test('clears the pending deadline timer once getReviews resolves first (no dangling timer)', async () => {
  const validId = new db.mongoose.Types.ObjectId().toString();
  Product.findById = () => ({ lean: async () => ({ _id: validId, name_en: 'iPhone 16' }) });
  reviewEngineMod.getReviews = async () => ({ type: 'blog_sentiment', aggregate_score: 5, count: 1, reviews: [] });

  const origSetTimeout = global.setTimeout;
  const origClearTimeout = global.clearTimeout;
  let capturedHandle;
  let clearedWith;
  global.setTimeout = (fn, ms) => { capturedHandle = origSetTimeout(fn, ms); return capturedHandle; };
  global.clearTimeout = (handle) => { clearedWith = handle; origClearTimeout(handle); };

  try {
    const res = mockRes();
    await getProduct({ params: { id: validId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(clearedWith, capturedHandle);
  } finally {
    global.setTimeout = origSetTimeout;
    global.clearTimeout = origClearTimeout;
  }
});
