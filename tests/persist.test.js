process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const Store = require('../src/models/Store');
const Product = require('../src/models/Product');
const { upsertProduct, upsertAll } = require('../src/services/persist');

const origStoreFind = Store.find;
const origProductUpdate = Product.findOneAndUpdate;
beforeEach(() => {
  Store.find = origStoreFind;
  Product.findOneAndUpdate = origProductUpdate;
});

const item = (over = {}) => ({
  name_en: 'iPhone 17 Pro Max',
  store_name: 'priceoye.pk',
  category: 'B',
  price_pkr: 468999,
  source_url: 'https://priceoye.pk/p',
  ...over,
});

test('tags available_in_store true when the store has a branch in the search city', async () => {
  Store.find = async () => [{ domain: 'priceoye.pk', cities_physical: ['islamabad', 'lahore'] }];
  let saved = null;
  Product.findOneAndUpdate = async (query, update) => { saved = update.$set; };
  await upsertProduct(item(), 'Islamabad');
  assert.equal(saved.available_in_store, true);
});

test('tags available_in_store false when the store has no branch in the city', async () => {
  Store.find = async () => [{ domain: 'priceoye.pk', cities_physical: ['lahore'] }];
  let saved = null;
  Product.findOneAndUpdate = async (query, update) => { saved = update.$set; };
  await upsertProduct(item(), 'islamabad');
  assert.equal(saved.available_in_store, false);
});

test('tags available_in_store false when the store is not in the curated table', async () => {
  Store.find = async () => [];
  let saved = null;
  Product.findOneAndUpdate = async (query, update) => { saved = update.$set; };
  await upsertProduct(item(), 'islamabad');
  assert.equal(saved.available_in_store, false);
});

test('matches a display-name store_name ("Daraz") to its domain entry ("daraz.pk")', async () => {
  Store.find = async () => [{ domain: 'daraz.pk', cities_physical: ['karachi'] }];
  let saved = null;
  Product.findOneAndUpdate = async (query, update) => { saved = update.$set; };
  await upsertProduct(item({ store_name: 'Daraz' }), 'karachi');
  assert.equal(saved.available_in_store, true);
});

test('upserts keyed on (store_name, source_url)', async () => {
  Store.find = async () => [];
  let query = null;
  Product.findOneAndUpdate = async (q) => { query = q; };
  await upsertProduct(item({ store_name: 'daraz.pk', source_url: 'https://daraz.pk/x' }), 'islamabad');
  assert.deepEqual(query, { store_name: 'daraz.pk', source_url: 'https://daraz.pk/x' });
});

test('upsertAll isolates a single item failure (does not throw, continues to the next item)', async () => {
  Store.find = async () => [];
  let calls = 0;
  Product.findOneAndUpdate = async () => {
    calls++;
    if (calls === 1) throw new Error('duplicate key');
  };
  await upsertAll([item(), item({ source_url: 'https://priceoye.pk/p2' })], 'islamabad');
  assert.equal(calls, 2);
});
