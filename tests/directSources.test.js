process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { getDarazProducts } = require('../src/discovery/directSources');
const realFetch = global.fetch;
beforeEach(() => { global.fetch = realFetch; });

test('maps Daraz listItems → ProductDrafts (normalized urls, PKR price)', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ mods: { listItems: [
    { name: 'Apple iPhone 17 Pro Max', price: '489999', image: '//img.daraz.pk/a.jpg', itemUrl: '//www.daraz.pk/products/x-i1.html', ratingScore: '4.5' },
  ] } }) });
  const [p] = await getDarazProducts('iphone 17 pro max');
  assert.equal(p.name, 'Apple iPhone 17 Pro Max');
  assert.equal(p.price_pkr, 489999);
  assert.equal(p.store_name, 'Daraz');
  assert.equal(p.source, 'daraz');
  assert.equal(p.image, 'https://img.daraz.pk/a.jpg');
  assert.equal(p.source_url, 'https://www.daraz.pk/products/x-i1.html');
  assert.equal(p.url, p.source_url);
});
test('no listItems → []', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ mods: {} }) });
  assert.deepEqual(await getDarazProducts('x'), []);
});
test('fetch error → [] (never throws)', async () => {
  global.fetch = async () => { throw new Error('network'); };
  assert.deepEqual(await getDarazProducts('x'), []);
});
test('drops items missing price or url', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ mods: { listItems: [
    { name: 'NoPrice', itemUrl: '//www.daraz.pk/p/1' },
    { name: 'NoUrl', price: '1000' },
    { name: 'Good', price: '50000', itemUrl: '//www.daraz.pk/p/2' },
  ] } }) });
  const out = await getDarazProducts('x');
  assert.deepEqual(out.map((p) => p.name), ['Good']);
});
