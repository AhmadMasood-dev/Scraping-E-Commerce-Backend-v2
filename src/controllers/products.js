const Product = require('../models/Product');
const db = require('../config/db');
const logger = require('../config/logger');

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { price_pkr: 1 },
  price_desc: { price_pkr: -1 },
  rating: { rating: -1 },
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CATS = ['A', 'B', 'C', 'D'];

function format(doc) {
  return {
    id: String(doc._id),
    name_en: doc.name_en,
    name_ur: doc.name_ur,
    brand: doc.brand,
    category: doc.category,
    product_category: doc.product_category,
    price_pkr: doc.price_pkr,
    image_url: doc.image_url,
    source_url: doc.source_url,
    store_name: doc.store_name,
    rating: doc.rating,
    available_in_store: doc.available_in_store,
    updated_at: doc.updatedAt,
  };
}

// GET /api/v1/products?category=&brand=&minPrice=&maxPrice=&q=&sort=&page=&limit=
async function listProducts(req, res) {
  try {
    if (db.mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, error: 'Product data temporarily unavailable' });
    }

    const { category, brand, minPrice, maxPrice, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    // The shared collection carries legacy/pre-v2-schema documents (no price_pkr, invalid
    // category values) — require the real v2 shape so garbage never surfaces in listings/sorts.
    const filter = {
      category: { $in: CATS },
      price_pkr: { $type: 'number' },
      name_en: { $exists: true, $ne: '' },
    };
    if (category) filter.product_category = new RegExp(`^${escapeRegex(category)}$`, 'i');
    if (brand) filter.brand = new RegExp(`^${escapeRegex(brand)}$`, 'i');
    const min = Number(minPrice);
    const max = Number(maxPrice);
    if (!Number.isNaN(min)) filter.price_pkr.$gte = min;
    if (!Number.isNaN(max)) filter.price_pkr.$lte = max;
    if (q) filter.$text = { $search: q };

    const sortSpec = SORTS[req.query.sort] || SORTS.newest;

    const [total, docs] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter).sort(sortSpec).skip((page - 1) * limit).limit(limit).lean(),
    ]);

    return res.json({
      success: true,
      data: docs.map(format),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (e) {
    logger.error(`[products] ${e.message}\n${e.stack}`);
    return res.status(500).json({ success: false, error: 'Failed to load products' });
  }
}

module.exports = { listProducts };
