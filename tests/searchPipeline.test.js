process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const cache = require('../src/config/cache');
const disc = require('../src/discovery');
const fetchMod = require('../src/extract/fetchPage');
const extractMod = require('../src/extract');
const normMod = require('../src/services/normalize');
const { runSearch } = require('../src/services/searchPipeline');

const orig = {
  discover: disc.discover,
  fetchPage: fetchMod.fetchPage,
  extractProduct: extractMod.extractProduct,
  normalizeProducts: normMod.normalizeProducts,
};
const passthrough = async (drafts) => drafts.map((d) => ({ ...d, name_en: d.name_en || d.name, category: d.category || 'A' }));

beforeEach(() => {
  cache.clear();
  disc.discover = orig.discover;
  fetchMod.fetchPage = orig.fetchPage;
  extractMod.extractProduct = orig.extractProduct;
  normMod.normalizeProducts = orig.normalizeProducts;
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

test('relevance filter drops accessories + wrong variants', async () => {
  disc.discover = async () => ({
    links: [],
    directProducts: [
      { name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999 },
      { name: 'iPhone 17 Pro Max Cover', store_name: 'Daraz', price_pkr: 999 },
      { name: 'iPhone 15', store_name: 'X', price_pkr: 200000 },
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
  disc.discover = async () => { calls++; return { links: [], directProducts: [{ name: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 474999 }] }; };
  normMod.normalizeProducts = passthrough;
  await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  const p2 = await runSearch({ query: 'iphone 17 pro max', city: 'islamabad' });
  assert.equal(p2.cached, true);
  assert.equal(calls, 1);
});

test('one dead link is isolated (Promise.allSettled)', async () => {
  disc.discover = async () => ({ links: [{ url: 'https://a.pk/p' }, { url: 'https://b.pk/p' }], directProducts: [] });
  fetchMod.fetchPage = async (url) => { if (url.includes('a.pk')) throw new Error('dead'); return { finalUrl: url, html: '<html>' }; };
  extractMod.extractProduct = async (url) => ({ name: 'iPhone 17 Pro Max', price_pkr: 468999, store_name: 'B', source_url: url });
  normMod.normalizeProducts = passthrough;
  assert.equal((await runSearch({ query: 'iphone 17 pro max' })).meta.total, 1);
});
