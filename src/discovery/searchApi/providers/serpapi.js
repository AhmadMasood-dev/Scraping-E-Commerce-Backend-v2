// SerpApi provider — real Google results via serpapi.com. No SDK; uses global fetch.
// Returns normalized organic results: [{ url, title, snippet }].
const ENDPOINT = 'https://serpapi.com/search';

// SerpApi's `location` param needs a CANONICAL string, else it errors. Map our cities to those;
// unmapped cities fall back to country-level gl=pk (no location param) so it never errors.
const CITY_LOCATION = {
  islamabad: 'Islamabad, Islamabad Capital Territory, Pakistan',
  lahore: 'Lahore, Punjab, Pakistan',
  karachi: 'Karachi, Sindh, Pakistan',
  rawalpindi: 'Rawalpindi, Punjab, Pakistan',
  faisalabad: 'Faisalabad, Punjab, Pakistan',
  peshawar: 'Peshawar, Khyber Pakhtunkhwa, Pakistan',
  quetta: 'Quetta, Balochistan, Pakistan',
  multan: 'Multan, Punjab, Pakistan',
};

async function search(query, { city = 'islamabad', num = 10, start = 0, timeoutMs = 15000 } = {}) {
  const key = process.env.SERPAPI_KEY;
  if (!key) {
    const e = new Error('SERPAPI_KEY missing');
    e.status = 401;
    throw e;
  }
  const params = new URLSearchParams({
    engine: 'google',
    q: query,
    gl: 'pk',
    hl: 'en',
    num: String(num),
    api_key: key,
  });
  if (start > 0) params.set('start', String(start));
  const loc = CITY_LOCATION[String(city || '').toLowerCase()];
  if (loc) params.set('location', loc);

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const e = new Error(`SerpApi HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return (data.organic_results || [])
    .map((r) => ({ url: r.link, title: r.title, snippet: r.snippet || '' }))
    .filter((r) => r.url);
}

module.exports = { search, id: 'serpapi', CITY_LOCATION };
