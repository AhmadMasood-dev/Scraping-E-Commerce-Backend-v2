process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const Product = require('../src/models/Product');
const db = require('../src/config/db');
const { listProducts } = require('../src/controllers/products');

const origFind = Product.find;
const origCount = Product.countDocuments;
beforeEach(() => {
  Product.find = origFind;
  Product.countDocuments = origCount;
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

function mockQuery(docs) {
  const q = {
    sort() { return q; },
    skip() { return q; },
    limit() { return q; },
    lean: async () => docs,
  };
  return q;
}

test('200 with paginated + formatted data, default sort/page/limit', async () => {
  Product.countDocuments = async () => 1;
  Product.find = () => mockQuery([{
    _id: 'p1', name_en: 'iPhone 16', name_ur: '', brand: 'Apple', category: 'A',
    product_category: 'Mobile Phones', price_pkr: 300000, image_url: 'i', source_url: 'u',
    store_name: 'priceoye.pk', rating: 5, available_in_store: false,
  }]);
  const res = mockRes();
  await listProducts({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].id, 'p1');
  assert.equal(res.body.data[0].store_name, 'priceoye.pk');
  assert.equal(res.body.data[0].product_category, 'Mobile Phones');
  assert.deepEqual(res.body.pagination, { page: 1, limit: 20, total: 1, pages: 1 });
});

test('filters by category (product_category, case-insensitive) + price range + brand', async () => {
  let capturedFilter;
  Product.countDocuments = async (f) => { capturedFilter = f; return 0; };
  Product.find = () => mockQuery([]);
  const res = mockRes();
  await listProducts({ query: { category: 'mobile phones', brand: 'apple', minPrice: '10000', maxPrice: '50000' } }, res);
  assert.ok(capturedFilter.product_category.test('Mobile Phones'));
  assert.ok(capturedFilter.brand.test('Apple'));
  assert.equal(capturedFilter.price_pkr.$gte, 10000);
  assert.equal(capturedFilter.price_pkr.$lte, 50000);
});

test('q uses the existing text index', async () => {
  let capturedFilter;
  Product.countDocuments = async (f) => { capturedFilter = f; return 0; };
  Product.find = () => mockQuery([]);
  await listProducts({ query: { q: 'laptop' } }, mockRes());
  assert.deepEqual(capturedFilter.$text, { $search: 'laptop' });
});

test('unknown sort falls back to newest', async () => {
  let capturedSort;
  Product.countDocuments = async () => 0;
  Product.find = () => {
    const q = mockQuery([]);
    q.sort = (s) => { capturedSort = s; return q; };
    return q;
  };
  await listProducts({ query: { sort: 'bogus' } }, mockRes());
  assert.deepEqual(capturedSort, { createdAt: -1 });
});

test('limit is capped at 100', async () => {
  let capturedLimit;
  Product.countDocuments = async () => 0;
  Product.find = () => {
    const q = mockQuery([]);
    q.limit = (n) => { capturedLimit = n; return q; };
    return q;
  };
  await listProducts({ query: { limit: '5000' } }, mockRes());
  assert.equal(capturedLimit, 100);
});

// The shared Atlas `products` collection has legacy documents from an older schema
// (no price_pkr, category values like "Mobile" instead of A/B/C/D) — found live when
// price_asc sort surfaced them first as `undefined`. The endpoint must not list them.
test('excludes documents that do not match the v2 Product shape (legacy/dirty data)', async () => {
  let capturedFilter;
  Product.countDocuments = async (f) => { capturedFilter = f; return 0; };
  Product.find = () => mockQuery([]);
  await listProducts({ query: {} }, mockRes());
  assert.deepEqual(capturedFilter.category, { $in: ['A', 'B', 'C', 'D'] });
  assert.equal(capturedFilter.price_pkr.$type, 'number');
  assert.deepEqual(capturedFilter.name_en, { $exists: true, $ne: '' });
});

test('the shape guard still applies alongside an explicit price range', async () => {
  let capturedFilter;
  Product.countDocuments = async (f) => { capturedFilter = f; return 0; };
  Product.find = () => mockQuery([]);
  await listProducts({ query: { minPrice: '1000' } }, mockRes());
  assert.equal(capturedFilter.price_pkr.$type, 'number');
  assert.equal(capturedFilter.price_pkr.$gte, 1000);
});

test('no matches → empty data, not an error', async () => {
  Product.countDocuments = async () => 0;
  Product.find = () => mockQuery([]);
  const res = mockRes();
  await listProducts({ query: { q: 'nonexistent-xyz' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, []);
});

test('503 when Mongo is not connected', async () => {
  db.mongoose.connection.readyState = 0;
  const res = mockRes();
  await listProducts({ query: {} }, res);
  assert.equal(res.statusCode, 503);
});
