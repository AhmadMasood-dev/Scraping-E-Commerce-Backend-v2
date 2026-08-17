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
