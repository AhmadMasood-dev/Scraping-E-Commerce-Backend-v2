process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const { validatePrice, priceFromOffers } = require('../src/extract/priceValidator');

test('validatePrice accepts numbers and numeric strings, normalizes to int PKR', () => {
  assert.equal(validatePrice(489999), 489999);
  assert.equal(validatePrice('489,999'), 489999);
  assert.equal(validatePrice('Rs 489,999'), 489999);
  assert.equal(validatePrice('PKR 489999.00'), 489999);
});

test('validatePrice rejects junk / out-of-range / non-PKR', () => {
  assert.equal(validatePrice('Call for price'), null);
  assert.equal(validatePrice(0), null);
  assert.equal(validatePrice(50), null); // below plausible floor
  assert.equal(validatePrice(''), null);
  assert.equal(validatePrice(489999, 'USD'), null); // wrong currency
  assert.equal(validatePrice(489999, 'PKR'), 489999);
});

test('priceFromOffers: single offer', () => {
  assert.equal(priceFromOffers({ price: '489999', priceCurrency: 'PKR' }), 489999);
});

test('priceFromOffers: array → lowest in-stock', () => {
  assert.equal(priceFromOffers([{ price: 550000 }, { price: 489999 }, { price: 500000 }]), 489999);
});

test('priceFromOffers: AggregateOffer → lowPrice', () => {
  assert.equal(
    priceFromOffers({ '@type': 'AggregateOffer', lowPrice: '489999', highPrice: '560000', priceCurrency: 'PKR' }),
    489999
  );
});

test('priceFromOffers: skips OutOfStock and wrong currency', () => {
  assert.equal(priceFromOffers({ price: 489999, availability: 'https://schema.org/OutOfStock' }), null);
  assert.equal(priceFromOffers({ price: 489999, priceCurrency: 'USD' }), null);
});

test('priceFromOffers: null/empty → null', () => {
  assert.equal(priceFromOffers(null), null);
  assert.equal(priceFromOffers([]), null);
});
