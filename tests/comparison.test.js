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
test('primary carries product_category from the head item', () => {
  const { primary } = buildComparison([
    { name_en: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 490000, source_url: 'd', product_category: 'Mobile Phones' },
    { name_en: 'iPhone 17 Pro Max', store_name: 'PriceOye', price_pkr: 468999, source_url: 'p', product_category: 'Mobile Phones' },
  ]);
  assert.equal(primary.product_category, 'Mobile Phones');
});

// TC-COMP-01 (UC-03): "If complete data is available, product comparison is displayed.
// If data is not available, no comparison is shown." A single-store match is incomplete
// data for a *comparison* — it still appears in storeResults, just not as a primary card.
test('TC-COMP-01: single-store match → no comparison shown (primary is null)', () => {
  const { primary, storeResults } = buildComparison([
    { name_en: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 490000, source_url: 'd', product_category: 'Mobile Phones' },
  ]);
  assert.equal(primary, null);
  assert.equal(storeResults.length, 1);
});

test('TC-COMP-01: two stores but only one has a valid price → still incomplete, no comparison', () => {
  const { primary } = buildComparison([
    { name_en: 'iPhone 17 Pro Max', store_name: 'Daraz', price_pkr: 490000, source_url: 'd' },
    { name_en: 'iPhone 17 Pro Max', store_name: 'PriceOye', price_pkr: 0, source_url: 'p' },
  ]);
  assert.equal(primary, null);
});
