process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const { createLimiter } = require('../src/config/limiter');

test('runs a single call immediately and resolves its value', async () => {
  const run = createLimiter(2);
  const out = await run(async () => 'done');
  assert.equal(out, 'done');
});

test('never runs more than max concurrently', async () => {
  const run = createLimiter(2);
  let active = 0;
  let peak = 0;
  const task = () => run(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    return 'ok';
  });
  await Promise.all([task(), task(), task(), task(), task()]);
  assert.ok(peak <= 2, `peak concurrency was ${peak}, expected <= 2`);
});

test('queued calls all eventually run and resolve their own value', async () => {
  const run = createLimiter(1);
  const results = await Promise.all([1, 2, 3].map((n) => run(async () => n * 10)));
  assert.deepEqual(results, [10, 20, 30]);
});

test('a rejected call does not block the rest of the queue', async () => {
  const run = createLimiter(1);
  const calls = [
    run(async () => { throw new Error('boom'); }),
    run(async () => 'survived'),
  ];
  const [first, second] = await Promise.allSettled(calls);
  assert.equal(first.status, 'rejected');
  assert.equal(second.status, 'fulfilled');
  assert.equal(second.value, 'survived');
});
