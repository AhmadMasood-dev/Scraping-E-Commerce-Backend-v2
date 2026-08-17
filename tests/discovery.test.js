process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const searchMod = require('../src/discovery/searchApi');
const directMod = require('../src/discovery/directSources');
const { discover } = require('../src/discovery');

const origSearch = searchMod.searchWeb;
const origDaraz = directMod.getDarazProducts;
beforeEach(() => { searchMod.searchWeb = origSearch; directMod.getDarazProducts = origDaraz; });

test('runs both lanes → { links, directProducts }', async () => {
  searchMod.searchWeb = async () => [{ url: 'https://priceoye.pk/p/1' }, { url: 'https://mercantile.com.pk/p/2' }];
  directMod.getDarazProducts = async () => [{ name: 'Daraz iPhone', store_name: 'Daraz', price_pkr: 489999, source: 'daraz' }];
  const { links, directProducts } = await discover('iphone 17 pro max', { city: 'islamabad' });
  assert.equal(directProducts.length, 1);
  assert.equal(links.length, 2);
});
test('filters unsafe/denied links and drops daraz.pk links', async () => {
  searchMod.searchWeb = async () => [
    { url: 'https://priceoye.pk/p/1' },
    { url: 'https://www.youtube.com/watch' },
    { url: 'http://x.pk/p' },
    { url: 'https://www.daraz.pk/products/x-i1.html' },
  ];
  directMod.getDarazProducts = async () => [];
  const { links } = await discover('q', {});
  assert.deepEqual(links.map((l) => l.url), ['https://priceoye.pk/p/1']);
});
test('dedupes duplicate links and caps at 8', async () => {
  searchMod.searchWeb = async () => Array.from({ length: 12 }, (_, i) => ({ url: `https://store${i % 10}.pk/p` }));
  directMod.getDarazProducts = async () => [];
  const { links } = await discover('q', {});
  assert.ok(links.length <= 8);
  assert.equal(new Set(links.map((l) => l.url)).size, links.length);
});
test('one lane failing → the other still returns', async () => {
  searchMod.searchWeb = async () => { throw new Error('serp down'); };
  directMod.getDarazProducts = async () => [{ name: 'Daraz', store_name: 'Daraz', price_pkr: 100000, source: 'daraz' }];
  const { links, directProducts } = await discover('q', {});
  assert.deepEqual(links, []);
  assert.equal(directProducts.length, 1);
});
