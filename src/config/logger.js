// Minimal logger — no dependency. Silent during tests (NODE_ENV=test) to keep output clean.
const ts = () => new Date().toISOString();
const emit = (level, msg) => {
  if (process.env.NODE_ENV === 'test' || process.env.LOG_SILENT === '1') return;
  // eslint-disable-next-line no-console
  console.log(`${ts()} [${level}] ${msg}`);
};

module.exports = {
  info: (m) => emit('info', m),
  warn: (m) => emit('warn', m),
  error: (m) => emit('error', m),
};
