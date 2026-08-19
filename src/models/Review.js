// Blog-sentiment reviews, one per scored article, linked to a Product. Trimmed from v1's Review
// model — source enum narrowed to just 'blog_sentiment' (no store-scraped user-review track, see
// docs/plans/2026-08-20-phase-6c-review-engine-design.md §2 for why).
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  source: { type: String, enum: ['blog_sentiment'], required: true },
  score: { type: Number, min: 0, max: 5, required: true },
  review_text: { type: String, default: '' },
  review_date: { type: Date, default: null },
  blog_url: { type: String, default: '' },
  timeframe_weight: { type: Number, default: 1.0 },
  within_timeframe: { type: Boolean, default: true },
}, { timestamps: true });

reviewSchema.index({ product_id: 1 });

module.exports = mongoose.model('Review', reviewSchema);
