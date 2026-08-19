process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const db = require('../src/config/db');

const origConnect = db.mongoose.connect;
beforeEach(() => { db.mongoose.connect = origConnect; });

test('connect() calls mongoose.connect with the given URI', async () => {
  let calledWith = null;
  db.mongoose.connect = async (uri) => { calledWith = uri; };
  await db.connect('mongodb://test-uri');
  assert.equal(calledWith, 'mongodb://test-uri');
});

test('connect() with no URI skips connecting and returns null', async () => {
  let called = false;
  db.mongoose.connect = async () => { called = true; };
  const result = await db.connect(undefined);
  assert.equal(called, false);
  assert.equal(result, null);
});
