process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const llm = require('../src/llm');
const searchMod = require('../src/discovery/searchApi');
const fetchMod = require('../src/extract/fetchPage');
const { scoreArticleSentiment, findArticles } = require('../src/services/reviewEngine');

const origRun = llm.runLLM;
const origSearchWeb = searchMod.searchWeb;
const origFetchPage = fetchMod.fetchPage;
beforeEach(() => {
  llm.runLLM = origRun;
  searchMod.searchWeb = origSearchWeb;
  fetchMod.fetchPage = origFetchPage;
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

test('findArticles filters out unsafe/denylisted links via urlGuard', async () => {
  searchMod.searchWeb = async () => [{ url: 'https://www.youtube.com/watch?v=x' }, { url: 'https://blog1.pk/a' }];
  fetchMod.fetchPage = async (url) => ({ finalUrl: url, html: '<p>text</p>' });
  const out = await findArticles('iPhone 16');
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://blog1.pk/a');
});
