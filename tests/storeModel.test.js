process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const Store = require('../src/models/Store');

test('valid store passes validation', () => {
  const s = new Store({ name: 'PriceOye', domain: 'priceoye.pk', cities_physical: ['lahore'] });
  assert.equal(s.validateSync(), undefined);
});

test('missing name fails validation', () => {
  const s = new Store({ domain: 'priceoye.pk' });
  const err = s.validateSync();
  assert.ok(err.errors.name);
});

test('missing domain fails validation', () => {
  const s = new Store({ name: 'PriceOye' });
  const err = s.validateSync();
  assert.ok(err.errors.domain);
});

test('cities_physical defaults to []', () => {
  const s = new Store({ name: 'Daraz', domain: 'daraz.pk' });
  assert.deepEqual(s.cities_physical, []);
});
