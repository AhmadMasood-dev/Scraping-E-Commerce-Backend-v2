// Gemini provider — Google Generative Language REST API (free tier). No SDK; uses global fetch.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

async function call({ system, prompt, json = false, model = DEFAULT_MODEL, timeoutMs = 20000 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error('GEMINI_API_KEY missing');
    e.status = 401;
    throw e;
  }
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
  };
  const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const e = new Error(`Gemini HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

module.exports = { call, id: 'gemini' };
