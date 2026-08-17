process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const { processQuery, detectLanguage } = require('../src/nlp/processor');

test('detectLanguage: en / ur-script / roman-urdu / default', () => {
  assert.equal(detectLanguage('iphone 17 pro max'), 'en');
  assert.equal(detectLanguage('آئی فون'), 'ur');
  assert.equal(detectLanguage('mujhe naya mobile chahiye'), 'ro');
  assert.equal(detectLanguage('xyz abc'), 'en');
});
test('processQuery en: normalized is the CLEANED query (not keyword-mangled)', async () => {
  const r = await processQuery('iphone 17 pro max');
  assert.equal(r.language, 'en');
  assert.equal(r.normalized, 'iphone 17 pro max'); // no "pro pro" duplication like v1
  assert.ok(Array.isArray(r.keywords) && r.keywords.length > 0);
});
test('processQuery roman-urdu → English translation', async () => {
  const r = await processQuery('naya mobile chahiye');
  assert.equal(r.language, 'ro');
  assert.ok(r.translated.includes('new'));
  assert.ok(r.translated.includes('smartphone'));
  assert.ok(!r.translated.includes('chahiye'));
});
test('empty query → safe shape', async () => {
  const r = await processQuery('');
  assert.equal(r.normalized, '');
  assert.deepEqual(r.keywords, []);
});
