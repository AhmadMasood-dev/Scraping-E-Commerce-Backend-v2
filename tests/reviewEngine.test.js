process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const llm = require('../src/llm');
const { scoreArticleSentiment } = require('../src/services/reviewEngine');

const origRun = llm.runLLM;
beforeEach(() => { llm.runLLM = origRun; });

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
