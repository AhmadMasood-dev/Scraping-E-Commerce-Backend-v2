// Curated (hand-seeded, not scraped) store metadata — currently just which cities each store
// has a physical branch in. Trimmed from v1's Store model: drops tier/scraper_type/cities_served/
// last_checked_at, which backed the per-store-scraper model v2 removed.
const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // hostname, e.g. "priceoye.pk" — matches searchPipeline.js's hostOf(), lowercase, no "www."
  domain: { type: String, required: true, unique: true },
  // lowercase city names with a physical branch; [] = online-only
  cities_physical: { type: [String], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Store', storeSchema);
