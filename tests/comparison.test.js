process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildComparison } = require('../src/services/comparison');

test('empty → null primary', () => {
  assert.deepEqual(buildComparison([]), { primary: null, storeResults: [] });
});
test('same product across two stores → primary with savings + cheapest_store', () => {
  const { primary, storeResults } = buildComparison([
    { name_en: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 490000, source_url: 'd', image: 'i1' },
    { name_en: 'iPhone 17 Pro Max', store_name: 'PriceOye', price_pkr: 468999, source_url: 'p', image: 'i2' },
  ]);
  assert.equal(primary.comparisons.length, 2);
  assert.equal(primary.cheapest_store, 'PriceOye');
  assert.equal(primary.savings, 490000 - 468999);
  assert.equal(primary.has_comparison, true);
  assert.equal(storeResults.length, 2);
});
test('drops zero-price items from storeResults', () => {
  assert.equal(buildComparison([{ name_en: 'x', store_name: 'A', price_pkr: 0 }]).storeResults.length, 0);
});
