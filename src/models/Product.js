// Persisted search-result items. Trimmed from v1's Product model: drops store_id ref/
// timeframe_tag/flagged/confidence/price_history — v2 has no admin-curated store registry to ref
// against (any domain SerpApi returns can produce a product), so store_name stays a plain string.
const mongoose = require('mongoose');

const CATS = ['A', 'B', 'C', 'D'];

const productSchema = new mongoose.Schema({
  name_en: { type: String, required: true },
  name_ur: { type: String, default: '' },
  brand: { type: String, default: '' },
  store_name: { type: String, required: true }, // hostname or display name — see persist.js's domainKey()
  category: { type: String, enum: CATS, required: true }, // A/B/C/D source-trust class (normalize.js)
  product_category: { type: String, default: '' }, // freeform product-type label, e.g. "Mobile Phones"
  price_pkr: { type: Number, required: true },
  source_url: { type: String, required: true },
  image_url: { type: String, default: '' },
  rating: { type: Number, default: null },
  available_in_store: { type: Boolean, default: false },
  description: { type: String, default: '' },
  review_count: { type: Number, default: null },
}, { timestamps: true });

productSchema.index({ store_name: 1, source_url: 1 }, { unique: true });
productSchema.index({ name_en: 'text' });
productSchema.index({ category: 1, price_pkr: 1 });

module.exports = mongoose.model('Product', productSchema);
