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
