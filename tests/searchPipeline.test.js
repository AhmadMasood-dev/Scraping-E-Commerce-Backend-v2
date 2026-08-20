process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const cache = require('../src/config/cache');
const disc = require('../src/discovery');
const fetchMod = require('../src/extract/fetchPage');
const extractMod = require('../src/extract');
const normMod = require('../src/services/normalize');
const persistMod = require('../src/services/persist');
const similarMod = require('../src/services/similar');
const { runSearch } = require('../src/services/searchPipeline');

const orig = {
  discover: disc.discover,
  fetchPage: fetchMod.fetchPage,
  extractProduct: extractMod.extractProduct,
  normalizeProducts: normMod.normalizeProducts,
  upsertAll: persistMod.upsertAll,
  findSimilar: similarMod.findSimilar,
  resolveIds: persistMod.resolveIds,
};
const passthrough = async (drafts) => drafts.map((d) => ({ ...d, name_en: d.name_en || d.name, category: d.category || 'A' }));

beforeEach(() => {
  cache.clear();
  disc.discover = orig.discover;
  fetchMod.fetchPage = orig.fetchPage;
  extractMod.extractProduct = orig.extractProduct;
  normMod.normalizeProducts = orig.normalizeProducts;
  persistMod.upsertAll = orig.upsertAll;
  similarMod.findSimilar = orig.findSimilar;
  persistMod.resolveIds = orig.resolveIds;
});

test('short query → error', async () => {
  assert.ok((await runSearch({ query: 'a' })).error);
});

test('full pipeline: direct + extracted → comparison payload', async () => {
  disc.discover = async () => ({
    links: [{ url: 'https://priceoye.pk/p' }],
    directProducts: [{ name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999, image: 'i', source_url: 'https://daraz.pk/p' }],
  });
  fetchMod.fetchPage = async () => ({ finalUrl: 'https://priceoye.pk/p', html: '<html>' });
  extractMod.extractProduct = async () => ({ name: 'iPhone 17 Pro Max', price_pkr: 468999, store_name: 'PriceOye', image: 'i2', source_url: 'https://priceoye.pk/p' });
  normMod.normalizeProducts = async (drafts) => drafts.map((d) => ({ ...d, name_en: 'iPhone 17 Pro Max', name_ur: 'آئی فون', brand: 'Apple', category: 'B' }));

  const p = await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  assert.equal(p.meta.total, 2);
  assert.equal(p.primary.comparisons.length, 2);
  assert.equal(p.primary.cheapest_store, 'PriceOye');
  assert.equal(p.results.B.length, 2);
  assert.equal(p.cached, false);
});

// TC-COMP-01 (UC-03) integration check: a single-store find is real product data (still
// shows up in results.*), but must NOT render as a "comparison" — that requires 2+ stores.
test('TC-COMP-01: single-store result → no primary comparison, item still in results', async () => {
  disc.discover = async () => ({
    links: [],
    directProducts: [{ name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999, image: 'i' }],
  });
  normMod.normalizeProducts = passthrough;

  const p = await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  assert.equal(p.meta.total, 1);
  assert.equal(p.primary, null);
  assert.equal(p.results.A.length, 1);
});

test('relevance filter drops accessories + wrong variants', async () => {
  disc.discover = async () => ({
    links: [],
    directProducts: [
      { name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999, image: 'i' },
      { name: 'iPhone 17 Pro Max Cover', store_name: 'Daraz', price_pkr: 999, image: 'i' },
      { name: 'iPhone 15', store_name: 'X', price_pkr: 200000, image: 'i' },
    ],
  });
  normMod.normalizeProducts = passthrough;
  assert.equal((await runSearch({ query: 'iphone 17 pro max' })).meta.total, 1);
});

test('no relevant results → empty payload, NOT cached', async () => {
  let calls = 0;
  disc.discover = async () => { calls++; return { links: [], directProducts: [{ name: 'Samsung Galaxy', store_name: 'X', price_pkr: 100000 }] }; };
  const p = await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  assert.equal(p.meta.total, 0);
  assert.equal(p.primary, null);
  await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' }); // recomputes
  assert.equal(calls, 2);
});

test('non-empty result is cached; second call is a cache hit', async () => {
  let calls = 0;
  disc.discover = async () => { calls++; return { links: [], directProducts: [{ name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999, image: 'i' }] }; };
  normMod.normalizeProducts = passthrough;
  await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  const p2 = await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  assert.equal(p2.cached, true);
  assert.equal(calls, 1);
});

test('one dead link is isolated (Promise.allSettled)', async () => {
  disc.discover = async () => ({ links: [{ url: 'https://a.pk/p' }, { url: 'https://b.pk/p' }], directProducts: [] });
  fetchMod.fetchPage = async (url) => { if (url.includes('a.pk')) throw new Error('dead'); return { finalUrl: url, html: '<html>' }; };
  extractMod.extractProduct = async (url) => ({ name: 'iPhone 17 Pro Max', price_pkr: 468999, store_name: 'B', source_url: url, image: 'i' });
  normMod.normalizeProducts = passthrough;
  assert.equal((await runSearch({ query: 'iphone 17 pro max' })).meta.total, 1);
});

test('formatted items carry description + review_count through', async () => {
  disc.discover = async () => ({
    links: [],
    directProducts: [{ name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999, image: 'i', description: 'A great phone', review_count: 42 }],
  });
  normMod.normalizeProducts = passthrough;
  const p = await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  assert.equal(p.results.A[0].description, 'A great phone');
  assert.equal(p.results.A[0].review_count, 42);
});

test('formatted items carry product_category through from normalize', async () => {
  disc.discover = async () => ({ links: [], directProducts: [{ name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999, source_url: 'https://daraz.pk/p', image: 'i' }] });
  normMod.normalizeProducts = async (drafts) => drafts.map((d) => ({ ...d, name_en: 'iPhone 17 Pro Max', category: 'A', product_category: 'Mobile Phones' }));
  const p = await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  assert.equal(p.results.A[0].product_category, 'Mobile Phones');
});

test('schedules a background persist of the formatted items (fire-and-forget)', async () => {
  disc.discover = async () => ({
    links: [],
    directProducts: [{ name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999, source_url: 'https://daraz.pk/p', image: 'i' }],
  });
  normMod.normalizeProducts = passthrough;
  let calledWith = null;
  persistMod.upsertAll = async (items, city) => { calledWith = { items, city }; };
  await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  await new Promise((r) => setImmediate(r));
  assert.equal(calledWith.items.length, 1);
  assert.equal(calledWith.items[0].store_name, 'Daraz');
  assert.equal(calledWith.city, 'islamabad');
});

test('attaches primary.similar from similar.findSimilar, called with the primary\'s own key + excluding its own comparison urls', async () => {
  disc.discover = async () => ({
    links: [],
    directProducts: [
      { name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999, source_url: 'https://daraz.pk/p', image: 'i' },
      { name: 'iPhone 17 Pro Max', store_name: 'PriceOye', price_pkr: 468999, source_url: 'https://priceoye.pk/p', image: 'i2' },
    ],
  });
  normMod.normalizeProducts = async (drafts) => drafts.map((d) => ({ ...d, name_en: 'iPhone 17 Pro Max', category: 'A', product_category: 'Mobile Phones' }));
  let calledWith = null;
  similarMod.findSimilar = async (opts) => { calledWith = opts; return [{ name_en: 'iPhone 16', price_pkr: 300000 }]; };

  const p = await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });

  assert.deepEqual(p.primary.similar, [{ name_en: 'iPhone 16', price_pkr: 300000 }]);
  assert.equal(calledWith.product_category, 'Mobile Phones');
  assert.equal(calledWith.category, 'A');
  assert.equal(calledWith.price_pkr, 468999);
  assert.deepEqual(calledWith.excludeUrls, ['https://priceoye.pk/p', 'https://daraz.pk/p']);
});

test('no primary (empty results) → similar.findSimilar is never called', async () => {
  disc.discover = async () => ({ links: [], directProducts: [{ name: 'Samsung Galaxy', store_name: 'X', price_pkr: 100000 }] });
  let called = false;
  similarMod.findSimilar = async () => { called = true; return []; };
  await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  assert.equal(called, false);
});

test('caps concurrent page-fetches across simultaneous searches', async () => {
  let active = 0;
  let peak = 0;
  disc.discover = async () => ({
    links: Array.from({ length: 3 }, (_, i) => ({ url: `https://a.pk/${i}` })),
    directProducts: [],
  });
  fetchMod.fetchPage = async (url) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    return { finalUrl: url, html: '<html>' };
  };
  extractMod.extractProduct = async (url) => ({ name: 'iPhone 17 Pro Max', price_pkr: 468999, store_name: 'B', source_url: url, image: 'i' });
  normMod.normalizeProducts = passthrough;

  // Two concurrent searches, each with 3 links → 6 total page-fetches in flight if uncapped.
  await Promise.all([
    runSearch({ query: 'iphone 17 pro max a' }),
    runSearch({ query: 'iphone 17 pro max b' }),
  ]);
  assert.ok(peak < 6, `peak concurrent page-fetches was ${peak}, expected a real cap below 6`);
});

test('includes each item\'s resolved _id in the response and passes the same ids to persist', async () => {
  disc.discover = async () => ({
    links: [],
    directProducts: [{ name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999, image: 'i', source_url: 'https://daraz.pk/p' }],
  });
  normMod.normalizeProducts = passthrough;
  const fakeId = 'fake-object-id-123';
  persistMod.resolveIds = async (items) => items.map((it) => ({ ...it, _id: fakeId }));
  let persistedWith = null;
  persistMod.upsertAll = async (items) => { persistedWith = items; };

  const p = await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });

  assert.equal(p.results.A[0]._id, fakeId);
  await new Promise((r) => setImmediate(r));
  assert.equal(persistedWith[0]._id, fakeId);
});

test('a failing background persist never breaks or delays the response', async () => {
  disc.discover = async () => ({
    links: [],
    directProducts: [{ name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999, source_url: 'https://daraz.pk/p2', image: 'i' }],
  });
  normMod.normalizeProducts = passthrough;
  persistMod.upsertAll = async () => { throw new Error('db down'); };
  const p = await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  assert.equal(p.meta.total, 1);
});
