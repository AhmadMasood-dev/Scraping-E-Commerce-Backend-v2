process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const Product = require('../src/models/Product');

const base = () => ({
  name_en: 'iPhone 17 Pro Max',
  store_name: 'priceoye.pk',
  category: 'B',
  price_pkr: 468999,
  source_url: 'https://priceoye.pk/p',
});

test('valid product passes validation', () => {
  const p = new Product(base());
  assert.equal(p.validateSync(), undefined);
});

test('missing required fields fail validation', () => {
  const p = new Product({});
  const err = p.validateSync();
  assert.ok(err.errors.name_en);
  assert.ok(err.errors.store_name);
  assert.ok(err.errors.category);
  assert.ok(err.errors.price_pkr);
  assert.ok(err.errors.source_url);
});

test('category must be one of A/B/C/D', () => {
  const p = new Product({ ...base(), category: 'Z' });
  const err = p.validateSync();
  assert.ok(err.errors.category);
});

test('optional fields default sanely', () => {
  const p = new Product(base());
  assert.equal(p.name_ur, '');
  assert.equal(p.brand, '');
  assert.equal(p.product_category, '');
  assert.equal(p.image_url, '');
  assert.equal(p.rating, null);
  assert.equal(p.available_in_store, false);
  assert.equal(p.description, '');
  assert.equal(p.review_count, null);
});
