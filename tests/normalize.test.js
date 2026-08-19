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

test('merges product_category from LLM output', async () => {
  llm.runLLM = async () => ({ items: [{ i: 0, name_en: 'iPhone 17 Pro Max', category: 'B', product_category: 'Mobile Phones' }] });
  const [it] = await normalizeProducts([draft()]);
  assert.equal(it.product_category, 'Mobile Phones');
});

test('LLM throws → passthrough sets product_category to empty by default', async () => {
  llm.runLLM = async () => { throw new Error('quota'); };
  const [it] = await normalizeProducts([draft()]);
  assert.equal(it.product_category, '');
});

test('system prompt frames the task for a Pakistani e-commerce app', async () => {
  let seenSystem = null;
  llm.runLLM = async ({ system }) => { seenSystem = system; return { items: [{ i: 0, name_en: 'X' }] }; };
  await normalizeProducts([draft()]);
  assert.match(seenSystem, /Pakistani/);
  assert.match(seenSystem, /e-commerce|price.?comparison/i);
});

test('user prompt gives brand-extraction examples and Urdu transliteration guidance', async () => {
  let seenPrompt = null;
  llm.runLLM = async ({ prompt }) => { seenPrompt = prompt; return { items: [{ i: 0, name_en: 'X' }] }; };
  await normalizeProducts([draft()]);
  assert.match(seenPrompt, /Samsung/);
  assert.match(seenPrompt, /transliteration/i);
});

test('user prompt still classifies category generically, no hardcoded store list', async () => {
  let seenPrompt = null;
  llm.runLLM = async ({ prompt }) => { seenPrompt = prompt; return { items: [{ i: 0, name_en: 'X' }] }; };
  await normalizeProducts([draft({ store_name: 'SomeOtherStore' })]);
  // The instruction text itself must not hardcode specific store names — only the item's own
  // store field (from the input data) is allowed to appear, and that's SomeOtherStore here.
  assert.doesNotMatch(seenPrompt, /Daraz|PriceOye|Telemart/);
});
