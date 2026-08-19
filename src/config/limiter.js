// Tiny zero-dependency concurrency limiter. Caps how many async fns run at once *globally*
// (shared across concurrent search requests, not just within one) — queues the rest, runs them
// as slots free up. Used to protect shared, quota-limited resources (outbound page fetches, the
// LLM providers) from being overwhelmed when multiple searches happen at the same time (#12).
function createLimiter(max) {
  let active = 0;
  const queue = [];

  function next() {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  }

  return function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

module.exports = { createLimiter };
