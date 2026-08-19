const Product = require('../models/Product');
const reviewEngine = require('../services/reviewEngine');
const db = require('../config/db');
const logger = require('../config/logger');

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

    const reviews = await reviewEngine.getReviews(product);
    return res.json({ success: true, product, reviews });
  } catch (e) {
    logger.error(`[product] ${e.message}\n${e.stack}`);
    return res.status(500).json({ success: false, error: 'Failed to load product' });
  }
}

module.exports = { getProduct };
