process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const llm = require('../src/llm');
const { normalizeProducts } = require('../src/services/normalize');

const origRun = llm.runLLM;
beforeEach(() => { llm.runLLM = origRun; });

const draft = (over = {}) => ({
  name: 'Apple Iphone 17 ProMax 256', price_pkr: 489999, image: 'i', source_url: 'u',
  store_name: 'PriceOye', rating: 4.6, ...over,
});

test('empty input → [] without calling the LLM', async () => {
  let called = false;
  llm.runLLM = async () => { called = true; return { items: [] }; };
  assert.deepEqual(await normalizeProducts([]), []);
  assert.equal(called, false);
});

test('merges name_en/name_ur/brand/category; price + store untouched', async () => {
  llm.runLLM = async () => ({ items: [{ i: 0, name_en: 'iPhone 17 Pro Max', name_ur: 'آئی فون', brand: 'Apple', category: 'B' }] });
  const [it] = await normalizeProducts([draft()]);
  assert.equal(it.name_en, 'iPhone 17 Pro Max');
  assert.equal(it.name_ur, 'آئی فون');
  assert.equal(it.brand, 'Apple');
  assert.equal(it.category, 'B');
  assert.equal(it.price_pkr, 489999);
  assert.equal(it.store_name, 'PriceOye');
});

test('LLM throws → passthrough (name_en=raw name, price kept, category A)', async () => {
  llm.runLLM = async () => { throw new Error('quota'); };
  const [it] = await normalizeProducts([draft()]);
  assert.equal(it.name_en, 'Apple Iphone 17 ProMax 256');
  assert.equal(it.name_ur, '');
  assert.equal(it.category, 'A');
  assert.equal(it.price_pkr, 489999);
});

test('incomplete output → retry once → passthrough', async () => {
  let calls = 0;
  llm.runLLM = async () => { calls++; return { items: [] }; }; // index 0 missing
  const out = await normalizeProducts([draft()]);
  assert.equal(calls, 2);
  assert.equal(out[0].name_en, 'Apple Iphone 17 ProMax 256');
});

test('invalid category coerced to A', async () => {
  llm.runLLM = async () => ({ items: [{ i: 0, name_en: 'X', category: 'Z' }] });
  assert.equal((await normalizeProducts([draft()]))[0].category, 'A');
});

test('recovers on the second attempt (flaky first call)', async () => {
  let calls = 0;
  llm.runLLM = async () => {
    calls++;
    if (calls === 1) throw new Error('flaky');
    return { items: [{ i: 0, name_en: 'iPhone 17 Pro Max', category: 'B' }] };
  };
  const [it] = await normalizeProducts([draft()]);
  assert.equal(calls, 2);
  assert.equal(it.name_en, 'iPhone 17 Pro Max');
});
