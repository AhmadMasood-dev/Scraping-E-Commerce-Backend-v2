process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const Product = require('../src/models/Product');
const db = require('../src/config/db');
const { findSimilar } = require('../src/services/similar');

const origFind = Product.find;
beforeEach(() => {
  Product.find = origFind;
  db.mongoose.connection.readyState = 1;
});

const doc = (over = {}) => ({
  name_en: 'iPhone 16', price_pkr: 300000, source_url: 'u', store_name: 'Daraz',
  category: 'A', product_category: 'Mobile Phones', available_in_store: true, ...over,
});

test('returns [] without querying when Mongo is not connected', async () => {
  db.mongoose.connection.readyState = 0;
  let called = false;
  Product.find = async () => { called = true; return []; };
  const out = await findSimilar({ product_category: 'Mobile Phones', price_pkr: 100 });
  assert.deepEqual(out, []);
  assert.equal(called, false);
});

test('queries by product_category when it is present', async () => {
  let filter = null;
  Product.find = (f) => { filter = f; return { lean: async () => [] }; };
  await findSimilar({ product_category: 'Mobile Phones', category: 'A', price_pkr: 100000 });
  assert.equal(filter.product_category, 'Mobile Phones');
  assert.equal(filter.category, undefined);
});

test('falls back to category when product_category is empty', async () => {
  let filter = null;
  Product.find = (f) => { filter = f; return { lean: async () => [] }; };
  await findSimilar({ product_category: '', category: 'A', price_pkr: 100000 });
  assert.equal(filter.category, 'A');
  assert.equal(filter.product_category, undefined);
});

test('excludes the given source_urls', async () => {
  let filter = null;
  Product.find = (f) => { filter = f; return { lean: async () => [] }; };
  await findSimilar({ product_category: 'Mobile Phones', price_pkr: 100000, excludeUrls: ['a', 'b'] });
  assert.deepEqual(filter.source_url, { $nin: ['a', 'b'] });
});

test('sorts by price-proximity and limits to the given count', async () => {
  Product.find = () => ({
    lean: async () => [
      doc({ source_url: 'far', price_pkr: 500000 }),
      doc({ source_url: 'near', price_pkr: 310000 }),
      doc({ source_url: 'exact', price_pkr: 300000 }),
    ],
  });
  const out = await findSimilar({ product_category: 'Mobile Phones', price_pkr: 300000 }, 2);
  assert.deepEqual(out.map((o) => o.source_url), ['exact', 'near']);
});

test('does not expose available_in_store on returned entries', async () => {
  Product.find = () => ({ lean: async () => [doc()] });
  const [it] = await findSimilar({ product_category: 'Mobile Phones', price_pkr: 300000 });
  assert.equal('available_in_store' in it, false);
});

test('a query failure degrades to []', async () => {
  Product.find = () => { throw new Error('mongo down'); };
  const out = await findSimilar({ product_category: 'Mobile Phones', price_pkr: 100000 });
  assert.deepEqual(out, []);
});
