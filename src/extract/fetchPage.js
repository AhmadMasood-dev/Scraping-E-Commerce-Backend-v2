// Safe HTML fetch. Validates the URL with the guard BEFORE each request AND on every redirect hop
// (SSRF-via-redirect). Rejects non-2xx, non-HTML, and oversized bodies; sends a realistic UA.
const { keepLink } = require('./urlGuard');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function fail(message, extra = {}) {
  const e = new Error(message);
  Object.assign(e, extra);
  return e;
}

// Read the body with a byte cap. Uses the stream when available, else falls back to text().
async function readCapped(res, maxBytes) {
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw fail('response too large', { code: 'TOO_LARGE' });
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await res.text();
  if (Buffer.byteLength(text) > maxBytes) throw fail('response too large', { code: 'TOO_LARGE' });
  return text;
}

// fetchPage(url, opts) → { finalUrl, html }
async function fetchPage(url, { timeoutMs = 6000, maxBytes = 2_000_000, maxRedirects = 3 } = {}) {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!keepLink(current)) throw fail(`blocked URL: ${current}`, { code: 'BLOCKED' });

    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(timeoutMs),
    });

    // Redirect: resolve + re-validate on the next loop iteration (SSRF-via-redirect guard).
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw fail('redirect without Location', { code: 'BAD_REDIRECT' });
      current = new URL(loc, current).toString();
      continue;
    }

    if (!res.ok) throw fail(`fetch HTTP ${res.status}`, { status: res.status });

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html')) throw fail(`non-HTML content-type: ${ct || 'none'}`, { code: 'NOT_HTML' });

    const cl = Number(res.headers.get('content-length') || 0);
    if (cl && cl > maxBytes) throw fail('response too large', { code: 'TOO_LARGE' });

    const html = await readCapped(res, maxBytes);
    return { finalUrl: current, html };
  }
  throw fail('too many redirects', { code: 'TOO_MANY_REDIRECTS' });
}

module.exports = { fetchPage };
