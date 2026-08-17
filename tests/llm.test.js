process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  runLLM,
  providerOrder,
  isQuotaError,
  parseJson,
  PROVIDERS,
  _resetCircuit,
} = require('../src/llm');

// Capture the real provider fns so we can restore between tests (each test re-stubs anyway).
const orig = {
  gemini: PROVIDERS.gemini.call,
  groq: PROVIDERS.groq.call,
};

beforeEach(() => {
  _resetCircuit();
  PROVIDERS.gemini.call = orig.gemini;
  PROVIDERS.groq.call = orig.groq;
  process.env.LLM_PRIMARY = 'gemini';
  process.env.LLM_FALLBACKS = 'groq';
});

test('primary success returns primary result; fallback not called', async () => {
  let groqCalled = false;
  PROVIDERS.gemini.call = async () => 'GEMINI_OK';
  PROVIDERS.groq.call = async () => {
    groqCalled = true;
    return 'GROQ';
  };
  const out = await runLLM({ prompt: 'hi' });
  assert.equal(out, 'GEMINI_OK');
  assert.equal(groqCalled, false);
});

test('primary 429 falls back to groq AND opens gemini circuit for the rest of the day', async () => {
  let geminiCalls = 0;
  PROVIDERS.gemini.call = async () => {
    geminiCalls++;
    const e = new Error('rate limit');
    e.status = 429;
    throw e;
  };
  PROVIDERS.groq.call = async () => 'GROQ_OK';

  const out1 = await runLLM({ prompt: 'hi' });
  assert.equal(out1, 'GROQ_OK');
  assert.equal(geminiCalls, 1);

  // circuit open → gemini skipped entirely on the next call
  const out2 = await runLLM({ prompt: 'again' });
  assert.equal(out2, 'GROQ_OK');
  assert.equal(geminiCalls, 1); // NOT retried
});

test('non-quota error also falls through to the fallback (but no circuit trip)', async () => {
  PROVIDERS.gemini.call = async () => {
    throw new Error('network glitch');
  };
  PROVIDERS.groq.call = async () => 'GROQ_OK';
  const out = await runLLM({ prompt: 'x' });
  assert.equal(out, 'GROQ_OK');
});

test('json:true parses an object and strips ```json fences', async () => {
  PROVIDERS.gemini.call = async () => '```json\n{"name":"iPhone 17 Pro Max","price":489999}\n```';
  const out = await runLLM({ prompt: 'x', json: true });
  assert.deepEqual(out, { name: 'iPhone 17 Pro Max', price: 489999 });
});

test('all providers failing throws a clear error', async () => {
  PROVIDERS.gemini.call = async () => {
    throw new Error('boom');
  };
  PROVIDERS.groq.call = async () => {
    throw new Error('boom2');
  };
  await assert.rejects(() => runLLM({ prompt: 'x' }), /All LLM providers failed/);
});

test('providerOrder respects env, keeps primary first, dedupes, filters unknown', () => {
  process.env.LLM_PRIMARY = 'groq';
  process.env.LLM_FALLBACKS = 'gemini,groq,claude'; // 'claude' no longer a provider → filtered out
  assert.deepEqual(providerOrder(), ['groq', 'gemini']);
});

test('isQuotaError detects 429/503 and quota text, ignores others', () => {
  assert.equal(isQuotaError({ status: 429 }), true);
  assert.equal(isQuotaError({ status: 503 }), true);
  assert.equal(isQuotaError({ message: 'quota exceeded' }), true);
  assert.equal(isQuotaError({ status: 500 }), false);
});

test('parseJson handles plain and fenced JSON', () => {
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
});

test('runLLM requires a prompt', async () => {
  await assert.rejects(() => runLLM({}), /prompt is required/);
});
