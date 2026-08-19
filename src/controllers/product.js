const Product = require('../models/Product');
const reviewEngine = require('../services/reviewEngine');
const db = require('../config/db');
const logger = require('../config/logger');

const EMPTY_REVIEWS = { type: 'none', aggregate_score: null, count: 0, reviews: [] };
const REVIEWS_TIMEOUT_MS = 25000;

// GET /products/:id
async function getProduct(req, res) {
  try {
    const { id } = req.params;
    if (!db.mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid product id' });
    }
    if (db.mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, error: 'Product data temporarily unavailable' });
    }

    const product = await Product.findById(id).lean();
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    // Cache-miss worst case (~120s of scrape+LLM) exceeds the frontend's 90s axios timeout, and a
    // client-side timeout + retry would restart a FRESH scrape each time. Race a 25s deadline instead:
    // the loser keeps running in the background and still persists via Review.insertMany, so the
    // NEXT request for this product is fast even though THIS one degraded to the empty shape.
    const reviews = await Promise.race([
      reviewEngine.getReviews(product).catch((e) => {
        logger.error(`[product] getReviews failed: ${e.message}`);
        return EMPTY_REVIEWS;
      }),
      new Promise((resolve) => setTimeout(() => resolve(EMPTY_REVIEWS), REVIEWS_TIMEOUT_MS)),
    ]);
    return res.json({ success: true, product, reviews });
  } catch (e) {
    logger.error(`[product] ${e.message}\n${e.stack}`);
    return res.status(500).json({ success: false, error: 'Failed to load product' });
  }
}

module.exports = { getProduct };
