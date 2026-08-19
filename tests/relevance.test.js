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
