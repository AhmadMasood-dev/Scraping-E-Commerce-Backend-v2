process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const llm = require('../src/llm');
const searchMod = require('../src/discovery/searchApi');
const fetchMod = require('../src/extract/fetchPage');
const Review = require('../src/models/Review');
const db = require('../src/config/db');
const cache = require('../src/config/cache');
const { scoreArticleSentiment, findArticles, getReviews } = require('../src/services/reviewEngine');

const origRun = llm.runLLM;
const origSearchWeb = searchMod.searchWeb;
const origFetchPage = fetchMod.fetchPage;
const origReviewFind = Review.find;
const origReviewInsertMany = Review.insertMany;
beforeEach(() => {
  llm.runLLM = origRun;
  searchMod.searchWeb = origSearchWeb;
  fetchMod.fetchPage = origFetchPage;
  Review.find = origReviewFind;
  Review.insertMany = origReviewInsertMany;
  db.mongoose.connection.readyState = 1;
  cache.clear(); // the per-product negative-reviews cache is in-memory and module-global; tests must not bleed into each other
});

test('returns score + summary for a relevant article', async () => {
  llm.runLLM = async () => ({ relevant: true, score: 4, summary: 'Solid mid-range phone.' });
  const out = await scoreArticleSentiment('iPhone 16', 'article text');
  assert.deepEqual(out, { relevant: true, score: 4, summary: 'Solid mid-range phone.' });
});

test('returns null when the article is not relevant', async () => {
  llm.runLLM = async () => ({ relevant: false, score: null, summary: '' });
  assert.equal(await scoreArticleSentiment('iPhone 16', 'unrelated text'), null);
});

test('returns null on an out-of-range score (does not trust the model blindly)', async () => {
  llm.runLLM = async () => ({ relevant: true, score: 9, summary: 'x' });
  assert.equal(await scoreArticleSentiment('iPhone 16', 'text'), null);
});

test('returns null when the LLM call fails', async () => {
  llm.runLLM = async () => { throw new Error('quota'); };
  assert.equal(await scoreArticleSentiment('iPhone 16', 'text'), null);
});

test('returns null on missing/invalid output shape', async () => {
  llm.runLLM = async () => null;
  assert.equal(await scoreArticleSentiment('iPhone 16', 'text'), null);
});

test('findArticles fetches and cleans each search result, capped at 3', async () => {
  searchMod.searchWeb = async () => [
    { url: 'https://blog1.pk/a' }, { url: 'https://blog2.pk/b' },
    { url: 'https://blog3.pk/c' }, { url: 'https://blog4.pk/d' },
  ];
  fetchMod.fetchPage = async (url) => ({ finalUrl: url, html: '<p>review of the phone</p>' });
  const out = await findArticles('iPhone 16');
  assert.equal(out.length, 3);
  assert.equal(out[0].url, 'https://blog1.pk/a');
  assert.match(out[0].text, /review of the phone/);
});

test('findArticles isolates a single fetch failure (other articles still return)', async () => {
  searchMod.searchWeb = async () => [{ url: 'https://blog1.pk/a' }, { url: 'https://blog2.pk/b' }];
  fetchMod.fetchPage = async (url) => {
    if (url.includes('blog1')) throw new Error('dead link');
    return { finalUrl: url, html: '<p>text</p>' };
  };
  const out = await findArticles('iPhone 16');
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://blog2.pk/b');
});

test('findArticles degrades to [] when the blog search itself fails', async () => {
  searchMod.searchWeb = async () => { throw new Error('quota'); };
  assert.deepEqual(await findArticles('iPhone 16'), []);
});

test('findArticles filters out SSRF-unsafe links but keeps the store-denylisted ones (wrong list for review discovery)', async () => {
  // gsmarena/reddit/youtube are on urlGuard's STORE denylist, but are good review sources — findArticles
  // now uses isSafeUrl (SSRF-only), not filterLinks (SSRF + store denylist). Only the http:// link,
  // which is genuinely SSRF-unsafe, should be dropped.
  searchMod.searchWeb = async () => [
    { url: 'http://insecure.pk/a' },
    { url: 'https://www.gsmarena.com/review' },
    { url: 'https://www.reddit.com/r/phones/x' },
    { url: 'https://www.youtube.com/watch?v=x' },
  ];
  fetchMod.fetchPage = async (url) => ({ finalUrl: url, html: '<p>text</p>' });
  const out = await findArticles('iPhone 16');
  const urls = out.map((a) => a.url);
  assert.ok(!urls.includes('http://insecure.pk/a'));
  assert.ok(urls.includes('https://www.gsmarena.com/review'));
  assert.ok(urls.includes('https://www.reddit.com/r/phones/x'));
});

const product = (over = {}) => ({ _id: 'prod-1', name_en: 'iPhone 16', ...over });

test('returns cached reviews immediately without re-scraping', async () => {
  Review.find = () => ({ lean: async () => [{ source: 'blog_sentiment', score: 4, review_date: new Date() }] });
  let searchCalled = false;
  searchMod.searchWeb = async () => { searchCalled = true; return []; };
  const out = await getReviews(product());
  assert.equal(out.type, 'blog_sentiment');
  assert.equal(out.count, 1);
  assert.equal(searchCalled, false);
});

test('scrapes, scores, persists, and returns fresh reviews on a cache miss', async () => {
  Review.find = () => ({ lean: async () => [] });
  searchMod.searchWeb = async () => [{ url: 'https://blog1.pk/a' }];
  fetchMod.fetchPage = async (url) => ({ finalUrl: url, html: '<p>great phone review</p>' });
  llm.runLLM = async () => ({ relevant: true, score: 5, summary: 'Excellent.' });
  let persisted = null;
  Review.insertMany = async (docs) => { persisted = docs; };

  const out = await getReviews(product());

  assert.equal(out.type, 'blog_sentiment');
  assert.equal(out.count, 1);
  assert.equal(out.aggregate_score, 5);
  assert.equal(persisted[0].product_id, 'prod-1');
  assert.equal(persisted[0].blog_url, 'https://blog1.pk/a');
  assert.ok(persisted[0].review_date instanceof Date, 'a freshly-scraped review should carry the real scrape date, not null');
});

test('no relevant articles found → graceful empty response, nothing persisted', async () => {
  Review.find = () => ({ lean: async () => [] });
  searchMod.searchWeb = async () => [{ url: 'https://blog1.pk/a' }];
  fetchMod.fetchPage = async (url) => ({ finalUrl: url, html: '<p>unrelated text</p>' });
  llm.runLLM = async () => ({ relevant: false, score: null, summary: '' });
  let insertCalled = false;
  Review.insertMany = async () => { insertCalled = true; };

  const out = await getReviews(product());

  assert.deepEqual(out, { type: 'none', aggregate_score: null, count: 0, reviews: [] });
  assert.equal(insertCalled, false);
});

test('skips the DB cache check and persist step when Mongo is not connected, still returns live results', async () => {
  db.mongoose.connection.readyState = 0;
  let findCalled = false;
  Review.find = () => { findCalled = true; return { lean: async () => [] }; };
  searchMod.searchWeb = async () => [{ url: 'https://blog1.pk/a' }];
  fetchMod.fetchPage = async (url) => ({ finalUrl: url, html: '<p>great phone</p>' });
  llm.runLLM = async () => ({ relevant: true, score: 4, summary: 'Good.' });
  let insertCalled = false;
  Review.insertMany = async () => { insertCalled = true; };

  const out = await getReviews(product());

  assert.equal(findCalled, false);
  assert.equal(insertCalled, false);
  assert.equal(out.count, 1);
  assert.equal(out.aggregate_score, 4);
});

test('negative cache: a second call for a product with no relevant reviews does not re-run the search (quota protection)', async () => {
  Review.find = () => ({ lean: async () => [] });
  let searchCalls = 0;
  searchMod.searchWeb = async () => { searchCalls++; return [{ url: 'https://blog1.pk/a' }]; };
  fetchMod.fetchPage = async (url) => ({ finalUrl: url, html: '<p>unrelated text</p>' });
  llm.runLLM = async () => ({ relevant: false, score: null, summary: '' });

  const p = product({ _id: 'prod-negcache' });
  const first = await getReviews(p);
  assert.deepEqual(first, { type: 'none', aggregate_score: null, count: 0, reviews: [] });
  assert.equal(searchCalls, 1);

  const second = await getReviews(p);
  assert.deepEqual(second, { type: 'none', aggregate_score: null, count: 0, reviews: [] });
  assert.equal(searchCalls, 1, 'second call should short-circuit on the negative cache, not re-run the search');
});

test('cache read failure (Review.find rejects) degrades to a live scrape instead of propagating', async () => {
  Review.find = () => ({ lean: async () => { throw new Error('mongo timeout'); } });
  searchMod.searchWeb = async () => [{ url: 'https://blog1.pk/a' }];
  fetchMod.fetchPage = async (url) => ({ finalUrl: url, html: '<p>great phone review</p>' });
  llm.runLLM = async () => ({ relevant: true, score: 5, summary: 'Excellent.' });
  Review.insertMany = async () => {};

  const out = await getReviews(product({ _id: 'prod-cachefail' }));

  assert.equal(out.type, 'blog_sentiment');
  assert.equal(out.count, 1);
});
