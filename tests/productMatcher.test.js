process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const { group, diceSimilarity } = require('../src/scrapers/utils/productMatcher');

test('clusters the same product across stores', () => {
  const groups = group([{ name_en: 'iPhone 17 Pro Max' }, { name_en: 'iPhone 17 Pro Max' }, { name_en: 'Galaxy S24 Ultra' }], 'name_en');
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.length === 2)[0].name_en, 'iPhone 17 Pro Max');
});
test('diceSimilarity: 1 identical, low for different', () => {
  assert.equal(diceSimilarity('abc', 'abc'), 1);
  assert.ok(diceSimilarity('iphone', 'galaxy') < 0.3);
});
test('does not cluster different capacity variants despite near-identical titles', () => {
  const groups = group(
    [
      { name_en: 'Samsung Galaxy A17 8GB RAM 256GB Storage' },
      { name_en: 'Samsung Galaxy A17 8GB RAM 512GB Storage' },
    ],
    'name_en'
  );
  assert.equal(groups.length, 2);
});
test('still clusters identical-capacity variants', () => {
  const groups = group(
    [
      { name_en: 'Samsung Galaxy A17 8GB RAM 256GB Storage' },
      { name_en: 'Samsung Galaxy A17 8GB 256GB Storage (PTA Approved)' },
    ],
    'name_en'
  );
  assert.equal(groups.length, 1);
});
test('still clusters when neither title mentions capacity', () => {
  const groups = group([{ name_en: 'Apple iPhone 16' }, { name_en: 'Apple iPhone 16'  }], 'name_en');
  assert.equal(groups.length, 1);
});
