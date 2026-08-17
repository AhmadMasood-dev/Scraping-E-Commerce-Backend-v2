// Tiny zero-dependency TTL cache (replaces v1's lru-cache). Map + per-entry expiry.
const store = new Map();
const DEFAULT_TTL = 1000 * 60 * 30; // 30 min

function set(key, value, ttl = DEFAULT_TTL) {
  store.set(key, { value, expires: Date.now() + ttl });
}

function get(key) {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expires) {
    store.delete(key);
    return undefined;
  }
  return e.value;
}

function has(key) {
  return get(key) !== undefined;
}

function del(key) {
  return store.delete(key);
}

function clear() {
  store.clear();
}

module.exports = { get, set, has, del, clear, DEFAULT_TTL };
