process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const { filterRelevant } = require('../src/scrapers/utils/relevance');
const items = (names) => names.map((name) => ({ name, image: 'i.jpg', price_pkr: 1000 }));

test('keeps only titles containing every query token', () => {
  const out = filterRelevant(items(['Apple iPhone 17 Pro Max 256GB', 'iPhone 17', 'iPhone 17 Pro']), 'iphone 17 pro max');
  assert.deepEqual(out.map((i) => i.name), ['Apple iPhone 17 Pro Max 256GB']);
});
test('drops unrequested accessories', () => {
  assert.equal(filterRelevant(items(['iPhone 17 Pro Max Cover', 'iPhone 17 Pro Max Tempered Glass']), 'iphone 17 pro max').length, 0);
});
// Found live 2026-08-20: real Daraz listings bundle a genuine phone with a free accessory
// in the title ("...256GB + 20W Power Adapter & Silicone Case") — the old rule dropped these
// as if they WERE the accessory. A capacity token (256GB/512GB/...) is a strong signal the
// title is describing an actual device, not a standalone accessory — none of the pure
// accessory listings in the wild have one.
test('keeps a bundled listing (product + free accessory) when the title has a capacity token', () => {
  const out = filterRelevant(
    items(['Apple iPhone 17 Pro Max - 256GB + 20W Power Adapter & Silicone Case']),
    'iphone 17 pro max'
  );
  assert.equal(out.length, 1);
});
test('still drops a pure accessory listing with no capacity token', () => {
  const out = filterRelevant(items(['iPhone 17 Pro Max Silicone Case']), 'iphone 17 pro max');
  assert.equal(out.length, 0);
});
test('empty query → no filtering', () => {
  assert.equal(filterRelevant(items(['x']), '').length, 1);
});
test('drops items missing an image', () => {
  const out = filterRelevant(
    [{ name: 'iPhone 17 Pro Max', price_pkr: 468999, image: '' }, { name: 'iPhone 17 Pro Max', price_pkr: 468999, image: 'i.jpg' }],
    'iphone 17 pro max'
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].image, 'i.jpg');
});
test('drops items missing a valid price', () => {
  const out = filterRelevant(
    [
      { name: 'iPhone 17 Pro Max', price_pkr: 0, image: 'i.jpg' },
      { name: 'iPhone 17 Pro Max', price_pkr: null, image: 'i.jpg' },
      { name: 'iPhone 17 Pro Max', price_pkr: 468999, image: 'i.jpg' },
    ],
    'iphone 17 pro max'
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].price_pkr, 468999);
});
