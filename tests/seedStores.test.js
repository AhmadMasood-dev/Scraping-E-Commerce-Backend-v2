process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const Store = require('../src/models/Store');
const { seedStores, STORES } = require('../src/seed/stores');

const origUpdate = Store.updateOne;
beforeEach(() => { Store.updateOne = origUpdate; });

test('upserts every curated store idempotently by domain', async () => {
  const calls = [];
  Store.updateOne = async (query, update, opts) => { calls.push({ query, update, opts }); return { upsertedCount: 1 }; };
  await seedStores();
  assert.equal(calls.length, STORES.length);
  assert.deepEqual(calls[0].query, { domain: STORES[0].domain });
  assert.equal(calls[0].opts.upsert, true);
});

test('uses $setOnInsert so existing docs are never overwritten', async () => {
  Store.updateOne = async (query, update) => { assert.ok(update.$setOnInsert); return { upsertedCount: 0 }; };
  await seedStores();
});

test('returns the count of newly-added stores', async () => {
  Store.updateOne = async () => ({ upsertedCount: 1 });
  const added = await seedStores();
  assert.equal(added, STORES.length);
});
