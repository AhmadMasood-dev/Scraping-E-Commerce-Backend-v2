// Groq provider — OpenAI-compatible chat completions REST (free tier, fast). No SDK; uses global fetch.
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b'; // llama-3.3-70b-versatile was retired (404) as of 2026-08

async function call({ system, prompt, json = false, model = DEFAULT_MODEL, timeoutMs = 20000 }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    const e = new Error('GROQ_API_KEY missing');
    e.status = 401;
    throw e;
  }
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const e = new Error(`Groq HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

module.exports = { call, id: 'groq' };
