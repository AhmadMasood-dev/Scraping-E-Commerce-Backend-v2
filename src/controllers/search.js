const { runSearch } = require('../services/searchPipeline');
const logger = require('../config/logger');

// GET /api/v1/search?query=&description=&city=&lang=
async function search(req, res) {
  try {
    const { query, description, city, lang } = req.query;
    const result = await runSearch({ query, description, city: city || 'islamabad', lang });
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    return res.json({ success: true, ...result });
  } catch (e) {
    logger.error(`[search] ${e.message}\n${e.stack}`);
    return res.status(500).json({ success: false, error: 'Search failed. Please try again.' });
  }
}

module.exports = { search };
