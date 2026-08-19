const express = require('express');
const cors = require('cors');
const { search } = require('./controllers/search');
const { getProduct } = require('./controllers/product');
const logger = require('./config/logger');
const db = require('./config/db');

const app = express();

app.use(cors()); // let the :3000 frontend call :8080
app.use(express.json());

// basic security headers (zero-dep; helmet-lite)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// tiny in-memory rate limiter — 60 req/min per IP
const hits = new Map();
app.use((req, res, next) => {
  const ip = req.ip || 'x';
  const now = Date.now();
  const w = hits.get(ip) || { n: 0, t: now };
  if (now - w.t > 60000) {
    w.n = 0;
    w.t = now;
  }
  w.n += 1;
  hits.set(ip, w);
  if (w.n > 60) return res.status(429).json({ success: false, error: 'Too many requests' });
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'pqc-v2' }));
app.get('/api/v1/search', search);
app.get('/api/v1/products/:id', getProduct);

const PORT = process.env.PORT || 8080;

if (require.main === module) {
  db.connect().catch((e) => logger.warn(`[db] connect failed: ${e.message}`));
  const server = app.listen(PORT, () => logger.info(`[server] PQC v2 listening on http://localhost:${PORT}`));
  const shutdown = () => {
    logger.info('[server] shutting down');
    server.close(() => process.exit(0));
    db.disconnect().catch(() => {});
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { app };
