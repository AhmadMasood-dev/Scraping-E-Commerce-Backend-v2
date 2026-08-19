process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const Store = require('../src/models/Store');
const Product = require('../src/models/Product');
const db = require('../src/config/db');
const { upsertProduct, upsertAll, resolveIds } = require('../src/services/persist');

const origStoreFind = Store.find;
const origProductUpdate = Product.findOneAndUpdate;
const origProductFind = Product.find;
beforeEach(() => {
  Store.find = origStoreFind;
  Product.findOneAndUpdate = origProductUpdate;
  Product.find = origProductFind;
  db.mongoose.connection.readyState = 1;
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

test('upsertProduct puts _id in $setOnInsert, never in $set (so an existing doc\'s _id can never be overwritten)', async () => {
  Store.find = async () => [];
  const existingId = new db.mongoose.Types.ObjectId();
  let update = null;
  Product.findOneAndUpdate = async (query, u) => { update = u; };
  await upsertProduct(item({ _id: existingId }), 'islamabad');
  assert.equal(update.$set._id, undefined);
  assert.equal(String(update.$setOnInsert._id), String(existingId));
});

test('upsertProduct omits _id from $setOnInsert when the item has none (Mongo auto-generates on insert)', async () => {
  Store.find = async () => [];
  let update = null;
  Product.findOneAndUpdate = async (query, u) => { update = u; };
  await upsertProduct(item(), 'islamabad');
  assert.equal(update.$set._id, undefined);
  assert.deepEqual(update.$setOnInsert, {});
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

test('upsertAll is a no-op when Mongo is not connected', async () => {
  db.mongoose.connection.readyState = 0;
  let storeFindCalled = false;
  let productUpdateCalled = false;
  Store.find = async () => { storeFindCalled = true; return []; };
  Product.findOneAndUpdate = async () => { productUpdateCalled = true; };
  await upsertAll([item()], 'islamabad');
  assert.equal(storeFindCalled, false);
  assert.equal(productUpdateCalled, false);
});

test('resolveIds reuses an existing product\'s _id (matched by store_name+source_url)', async () => {
  const existingId = new db.mongoose.Types.ObjectId();
  Product.find = async () => [{ _id: existingId, store_name: 'daraz.pk', source_url: 'https://daraz.pk/p' }];
  const [out] = await resolveIds([{ store_name: 'daraz.pk', source_url: 'https://daraz.pk/p' }]);
  assert.equal(String(out._id), String(existingId));
});

test('resolveIds mints a fresh _id for an item with no existing product', async () => {
  Product.find = async () => [];
  const [out] = await resolveIds([{ store_name: 'daraz.pk', source_url: 'https://daraz.pk/new' }]);
  assert.ok(db.mongoose.Types.ObjectId.isValid(out._id));
});

test('resolveIds returns items unchanged when Mongo is not connected', async () => {
  db.mongoose.connection.readyState = 0;
  let called = false;
  Product.find = async () => { called = true; return []; };
  const items = [{ store_name: 'daraz.pk', source_url: 'https://daraz.pk/p' }];
  const out = await resolveIds(items);
  assert.equal(called, false);
  assert.deepEqual(out, items);
});

test('resolveIds returns [] unchanged for an empty items array', async () => {
  let called = false;
  Product.find = async () => { called = true; return []; };
  assert.deepEqual(await resolveIds([]), []);
  assert.equal(called, false);
});
