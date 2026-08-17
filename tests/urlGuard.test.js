process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const { isSafeUrl, isDenied, keepLink, filterLinks } = require('../src/extract/urlGuard');

test('any https store domain passes — no allowlist', () => {
  assert.equal(keepLink('https://www.daraz.pk/products/x-i1.html'), true);
  assert.equal(keepLink('https://priceoye.pk/mobiles/apple'), true);
  assert.equal(keepLink('https://some-random-new-store.pk/p/9'), true); // unknown store still allowed
});

test('rejects non-https (http)', () => {
  assert.equal(isSafeUrl('http://www.daraz.pk/x'), false);
});

test('rejects localhost / .local / .internal', () => {
  assert.equal(isSafeUrl('https://localhost/x'), false);
  assert.equal(isSafeUrl('https://api.local/x'), false);
  assert.equal(isSafeUrl('https://svc.internal/x'), false);
});

test('rejects IP-literal hosts (private and IPv6 loopback)', () => {
  assert.equal(isSafeUrl('https://127.0.0.1/x'), false);
  assert.equal(isSafeUrl('https://10.0.0.5/x'), false);
  assert.equal(isSafeUrl('https://192.168.1.1/x'), false);
  assert.equal(isSafeUrl('https://169.254.169.254/latest/meta-data'), false); // cloud metadata SSRF target
  assert.equal(isSafeUrl('https://[::1]/x'), false);
});

test('denylist skips obvious non-stores (incl. subdomains)', () => {
  assert.equal(isDenied('https://www.youtube.com/watch?v=1'), true);
  assert.equal(isDenied('https://en.wikipedia.org/wiki/IPhone'), true);
  assert.equal(isDenied('https://www.gsmarena.com/apple-phone.php'), true);
  assert.equal(isDenied('https://www.daraz.pk/p/1'), false);
  assert.equal(keepLink('https://www.youtube.com/watch?v=1'), false);
});

test('invalid URLs are rejected', () => {
  assert.equal(isSafeUrl('not a url'), false);
  assert.equal(keepLink('not a url'), false);
});

test('filterLinks keeps only safe, non-denied links (accepts objects or strings)', () => {
  const links = [
    { url: 'https://www.daraz.pk/p/1', title: 'a' },
    { url: 'https://www.youtube.com/watch', title: 'b' }, // denied
    { url: 'http://priceoye.pk/x', title: 'c' }, // http
    { url: 'https://en.wikipedia.org/wiki/x', title: 'd' }, // denied
    { url: 'https://mercantile.com.pk/p/z', title: 'e' }, // unknown store → kept
  ];
  assert.deepEqual(
    filterLinks(links).map((l) => l.url),
    ['https://www.daraz.pk/p/1', 'https://mercantile.com.pk/p/z']
  );
});
