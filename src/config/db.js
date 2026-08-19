// Mongo connection (mongoose). Best-effort: a missing/broken MONGODB_URI must never crash the
// server — search itself doesn't read from Mongo, only background persistence writes to it.
const mongoose = require('mongoose');
const logger = require('./logger');

async function connect(uri = process.env.MONGODB_URI) {
  if (!uri) {
    logger.warn('[db] MONGODB_URI not set — persistence disabled');
    return null;
  }
  await mongoose.connect(uri);
  logger.info('[db] connected');
  return mongoose.connection;
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, disconnect, mongoose };
