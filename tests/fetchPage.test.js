process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { fetchPage } = require('../src/extract/fetchPage');

const realFetch = global.fetch;

function res({ status = 200, headers = {}, body = '' }) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => lower[k.toLowerCase()] ?? null },
    text: async () => body,
    body: null,
  };
}

// Queue of responses (one per fetch call); records the URLs fetched.
function queue(responses) {
  let i = 0;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return typeof r === 'function' ? r(url) : r;
  };
  return calls;
}

beforeEach(() => {
  global.fetch = realFetch;
});

test('happy path: returns { finalUrl, html }', async () => {
  const calls = queue([res({ headers: { 'content-type': 'text/html' }, body: '<html>ok</html>' })]);
  const out = await fetchPage('https://www.daraz.pk/p/1');
  assert.deepEqual(out, { finalUrl: 'https://www.daraz.pk/p/1', html: '<html>ok</html>' });
  assert.equal(calls.length, 1);
});

test('blocks an unsafe URL BEFORE fetching (http)', async () => {
  const calls = queue([res({ headers: { 'content-type': 'text/html' }, body: 'x' })]);
  await assert.rejects(() => fetchPage('http://www.daraz.pk/p/1'), /blocked/i);
  assert.equal(calls.length, 0); // never fetched
});

test('blocks a denied domain before fetching', async () => {
  const calls = queue([res({ headers: { 'content-type': 'text/html' }, body: 'x' })]);
  await assert.rejects(() => fetchPage('https://www.youtube.com/watch'), /blocked/i);
  assert.equal(calls.length, 0);
});

test('rejects a non-2xx response', async () => {
  queue([res({ status: 404, headers: { 'content-type': 'text/html' } })]);
  await assert.rejects(() => fetchPage('https://www.daraz.pk/p/1'), (e) => e.status === 404);
});

test('rejects a non-HTML content-type', async () => {
  queue([res({ headers: { 'content-type': 'application/json' }, body: '{}' })]);
  await assert.rejects(() => fetchPage('https://www.daraz.pk/p/1'), /non-HTML/i);
});

test('rejects an oversized response (content-length)', async () => {
  queue([res({ headers: { 'content-type': 'text/html', 'content-length': '5000000' }, body: 'big' })]);
  await assert.rejects(() => fetchPage('https://www.daraz.pk/p/1', { maxBytes: 1000 }), /too large/i);
});

test('follows a safe redirect and returns the final URL', async () => {
  const calls = queue([
    res({ status: 302, headers: { location: 'https://priceoye.pk/final' } }),
    res({ headers: { 'content-type': 'text/html' }, body: '<html>final</html>' }),
  ]);
  const out = await fetchPage('https://www.daraz.pk/start');
  assert.equal(out.finalUrl, 'https://priceoye.pk/final');
  assert.equal(out.html, '<html>final</html>');
  assert.equal(calls.length, 2);
});

test('blocks a redirect to a private IP (SSRF-via-redirect)', async () => {
  const calls = queue([
    res({ status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } }),
    res({ headers: { 'content-type': 'text/html' }, body: 'secret' }),
  ]);
  await assert.rejects(() => fetchPage('https://www.daraz.pk/start'), /blocked/i);
  assert.equal(calls.length, 1); // second (unsafe) hop never fetched
});

test('rejects too many redirects', async () => {
  queue([res({ status: 302, headers: { location: 'https://www.daraz.pk/loop' } })]); // always redirects
  await assert.rejects(() => fetchPage('https://www.daraz.pk/start', { maxRedirects: 2 }), /too many redirects/i);
});
