process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const serpapi = require('../src/discovery/searchApi/providers/serpapi');
const {
  searchWeb,
  providerOrder,
  isQuotaError,
  PROVIDERS,
  _resetCircuit,
} = require('../src/discovery/searchApi');

const realFetch = global.fetch;
const origSearch = serpapi.search; // capture real provider fn (PROVIDERS.serpapi === serpapi)

beforeEach(() => {
  global.fetch = realFetch;
  _resetCircuit();
  process.env.SERPAPI_KEY = 'test-key';
  process.env.SEARCH_PRIMARY = 'serpapi';
  process.env.SEARCH_FALLBACKS = '';
  PROVIDERS.serpapi.search = origSearch; // router tests re-stub this
});

// ── provider: serpapi.search (fetch stubbed — asserts the real mapping + URL logic) ──

test('serpapi maps organic_results → { url, title, snippet }', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      organic_results: [
        { link: 'https://www.daraz.pk/p/1', title: 'iPhone 17 Pro Max', snippet: 'Buy now' },
        { link: 'https://priceoye.pk/p/2', title: 'iPhone 17 Pro Max — PriceOye', snippet: 'Best price' },
      ],
    }),
  });
  const out = await serpapi.search('iphone 17 pro max');
  assert.deepEqual(out, [
    { url: 'https://www.daraz.pk/p/1', title: 'iPhone 17 Pro Max', snippet: 'Buy now' },
    { url: 'https://priceoye.pk/p/2', title: 'iPhone 17 Pro Max — PriceOye', snippet: 'Best price' },
  ]);
});

test('serpapi returns [] when there are no organic_results', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({}) });
  assert.deepEqual(await serpapi.search('nothing here'), []);
});

test('serpapi sends gl=pk + canonical location for a known city', async () => {
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, json: async () => ({ organic_results: [] }) };
  };
  await serpapi.search('iphone', { city: 'islamabad' });
  assert.match(capturedUrl, /gl=pk/);
  assert.match(capturedUrl, /location=Islamabad/);
});

test('serpapi omits location for an unknown city (falls back to gl=pk)', async () => {
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, json: async () => ({ organic_results: [] }) };
  };
  await serpapi.search('iphone', { city: 'atlantis' });
  assert.match(capturedUrl, /gl=pk/);
  assert.ok(!/location=/.test(capturedUrl), 'no location param for an unknown city');
});

test('serpapi throws an error carrying .status on a non-200 (429)', async () => {
  global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(() => serpapi.search('x'), (e) => e.status === 429);
});

test('serpapi throws when SERPAPI_KEY is missing', async () => {
  delete process.env.SERPAPI_KEY;
  await assert.rejects(() => serpapi.search('x'), /SERPAPI_KEY missing/);
});

// ── router: searchWeb (provider stubbed) ──

test('searchWeb returns the provider results', async () => {
  PROVIDERS.serpapi.search = async () => [{ url: 'u', title: 't', snippet: 's' }];
  assert.deepEqual(await searchWeb('q'), [{ url: 'u', title: 't', snippet: 's' }]);
});

test('searchWeb: 429 trips the circuit; with no fallback it throws, and the next call skips the provider', async () => {
  let calls = 0;
  PROVIDERS.serpapi.search = async () => {
    calls++;
    const e = new Error('rate limit');
    e.status = 429;
    throw e;
  };
  await assert.rejects(() => searchWeb('q'), /All search providers failed/);
  assert.equal(calls, 1);
  await assert.rejects(() => searchWeb('q2'), /All search providers failed/); // circuit open
  assert.equal(calls, 1); // provider NOT retried
});

test('providerOrder respects env and filters unknown/deferred providers (e.g. serper)', () => {
  process.env.SEARCH_PRIMARY = 'serpapi';
  process.env.SEARCH_FALLBACKS = 'serper'; // deferred → not a provider yet → filtered out
  assert.deepEqual(providerOrder(), ['serpapi']);
});

test('isQuotaError detects 429/503 + quota text', () => {
  assert.equal(isQuotaError({ status: 429 }), true);
  assert.equal(isQuotaError({ message: 'rate limit exceeded' }), true);
  assert.equal(isQuotaError({ status: 500 }), false);
});

test('searchWeb requires a query', async () => {
  await assert.rejects(() => searchWeb(''), /query is required/);
});
