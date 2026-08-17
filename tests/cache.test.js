process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const { get, set, has, del, clear } = require('../src/config/cache');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('set/get/has/del/clear', () => {
  clear();
  set('k', 'v');
  assert.equal(get('k'), 'v');
  assert.equal(has('k'), true);
  del('k');
  assert.equal(get('k'), undefined);
  assert.equal(has('k'), false);
  set('a', 1); clear();
  assert.equal(get('a'), undefined);
});
test('entries expire after their TTL', async () => {
  clear();
  set('t', 'v', 5);
  assert.equal(get('t'), 'v');
  await sleep(15);
  assert.equal(get('t'), undefined);
});
