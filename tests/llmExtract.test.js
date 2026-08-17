process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const llm = require('../src/llm');
const { llmExtract, cleanText } = require('../src/extract/llmExtract');

const origRun = llm.runLLM;
beforeEach(() => {
  llm.runLLM = origRun;
});

test('cleanText strips scripts/styles/tags and caps length', () => {
  const t = cleanText('<style>x{}</style><script>bad()</script><h1>iPhone</h1> <p>desc</p>', 100);
  assert.ok(!/bad\(\)/.test(t), 'script content removed');
  assert.ok(/iPhone/.test(t) && /desc/.test(t));
});

test('valid product from LLM → draft (source: llm)', async () => {
  llm.runLLM = async () => ({
    product: true,
    name: 'iPhone 17 Pro Max',
    price_pkr: 489999,
    image: 'https://x/i.jpg',
    description: 'd',
    rating: 4.5,
  });
  const d = await llmExtract('https://x.pk/p', '<html>iphone 489999</html>');
  assert.equal(d.name, 'iPhone 17 Pro Max');
  assert.equal(d.price_pkr, 489999);
  assert.equal(d.rating, 4.5);
  assert.equal(d.source, 'llm');
});

test('product:false → null', async () => {
  llm.runLLM = async () => ({ product: false });
  assert.equal(await llmExtract('https://x.pk/p', '<html>blog post</html>'), null);
});

test('implausible price → null (guards fabricated data)', async () => {
  llm.runLLM = async () => ({ product: true, name: 'X', price_pkr: 5 });
  assert.equal(await llmExtract('https://x.pk/p', '<html>x</html>'), null);
});

test('missing name → null', async () => {
  llm.runLLM = async () => ({ product: true, name: '', price_pkr: 489999 });
  assert.equal(await llmExtract('https://x.pk/p', '<html>x</html>'), null);
});

test('out-of-range rating is nulled, not trusted', async () => {
  llm.runLLM = async () => ({ product: true, name: 'X', price_pkr: 489999, rating: 9 });
  assert.equal((await llmExtract('https://x.pk/p', '<html>x</html>')).rating, null);
});

test('LLM error → null (never throws)', async () => {
  llm.runLLM = async () => {
    throw new Error('quota');
  };
  assert.equal(await llmExtract('https://x.pk/p', '<html>x</html>'), null);
});

test('empty html → null without calling the LLM', async () => {
  let called = false;
  llm.runLLM = async () => {
    called = true;
    return { product: true, name: 'x', price_pkr: 100000 };
  };
  assert.equal(await llmExtract('https://x.pk/p', '   '), null);
  assert.equal(called, false);
});
