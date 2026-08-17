process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const llmMod = require('../src/extract/llmExtract');
const { extractProduct } = require('../src/extract');

const origLlm = llmMod.llmExtract;
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

beforeEach(() => {
  llmMod.llmExtract = origLlm;
});

test('structured success returns the structured draft; LLM NOT called', async () => {
  let called = false;
  llmMod.llmExtract = async () => {
    called = true;
    return { source: 'llm' };
  };
  const html = ld({ '@type': 'Product', name: 'iPhone', offers: { price: 489999, priceCurrency: 'PKR' } });
  const d = await extractProduct('https://x.pk/p', html);
  assert.equal(d.source, 'jsonld');
  assert.equal(d.price_pkr, 489999);
  assert.equal(called, false);
});

test('structured gap (no data) → LLM fallback', async () => {
  llmMod.llmExtract = async () => ({ url: 'https://x.pk/p', name: 'iPhone', price_pkr: 489999, source: 'llm' });
  const d = await extractProduct('https://x.pk/p', '<html><body>no structured data</body></html>');
  assert.equal(d.source, 'llm');
});

test('structured Product with name but no price → LLM fallback', async () => {
  llmMod.llmExtract = async () => ({ name: 'x', price_pkr: 100000, source: 'llm' });
  const html = ld({ '@type': 'Product', name: 'NoPrice' }); // no offers
  const d = await extractProduct('https://x.pk/p', html);
  assert.equal(d.source, 'llm');
});

test('listing page → null; LLM NOT called', async () => {
  let called = false;
  llmMod.llmExtract = async () => {
    called = true;
    return {};
  };
  const html = ld({ '@type': 'ItemList', itemListElement: [] });
  assert.equal(await extractProduct('https://x.pk/list', html), null);
  assert.equal(called, false);
});

test('no product anywhere → null', async () => {
  llmMod.llmExtract = async () => null;
  assert.equal(await extractProduct('https://x.pk/p', '<html>hi</html>'), null);
});
