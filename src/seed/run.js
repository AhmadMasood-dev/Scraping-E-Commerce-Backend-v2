// One-off runner: `npm run seed` — connects, seeds curated stores, disconnects.
const db = require('../config/db');
const { seedStores } = require('./stores');
const logger = require('../config/logger');

async function main() {
  await db.connect();
  const added = await seedStores();
  logger.info(`[seed] done (${added} added)`);
  await db.disconnect();
}

if (require.main === module) {
  main().catch((e) => {
    logger.error(`[seed] failed: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { main };
