// Pure structured-data extractor: JSON-LD (schema.org Product) + OpenGraph → partial ProductDraft.
// Returns: a draft object, `{ listing: true }` for multi-product/listing pages, or `null`.
// The draft may still lack name/price — the orchestrator decides whether to fall back to the LLM.
const { priceFromOffers, validatePrice } = require('./priceValidator');

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Parse every <script type="application/ld+json"> block, flattening @graph + arrays.
function jsonLdNodes(html) {
  const nodes = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      for (const d of Array.isArray(data) ? data : [data]) {
        if (d && Array.isArray(d['@graph'])) nodes.push(...d['@graph']);
        else if (d) nodes.push(d);
      }
    } catch {
      /* ignore malformed block */
    }
  }
  return nodes;
}

function typesOf(node) {
  const t = node && node['@type'];
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
}
const isProduct = (n) => typesOf(n).some((t) => /(^|\/|:)Product$/i.test(t));
const isItemList = (n) => typesOf(n).some((t) => /ItemList/i.test(t));

function firstImage(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return firstImage(img[0]);
  if (img.url) return String(img.url);
  return '';
}

function ogMeta(html, prop) {
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let m = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']*)["']`, 'i')
  );
  if (!m) {
    m = html.match(
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${esc}["']`, 'i')
    );
  }
  return m ? decodeEntities(m[1]) : null;
}

function extractStructured(url, html) {
  const nodes = jsonLdNodes(html);
  const products = nodes.filter(isProduct);
  if (products.length > 1 || nodes.some(isItemList)) return { listing: true };

  let draft = null;
  if (products.length === 1) {
    const p = products[0];
    const rating = p.aggregateRating ? Number(p.aggregateRating.ratingValue) : NaN;
    const rc = p.aggregateRating
      ? Number(p.aggregateRating.reviewCount ?? p.aggregateRating.ratingCount)
      : NaN;
    draft = {
      url,
      name: p.name ? String(p.name).trim() : '',
      price_pkr: priceFromOffers(p.offers),
      image: firstImage(p.image),
      description: p.description ? String(p.description).trim() : '',
      rating: Number.isFinite(rating) ? rating : null,
      review_count: Number.isFinite(rc) ? rc : null,
      reviews: [],
      source: 'jsonld',
    };
  }

  // OpenGraph — create a draft if none, else fill gaps.
  const og = {
    title: ogMeta(html, 'og:title'),
    image: ogMeta(html, 'og:image'),
    description: ogMeta(html, 'og:description'),
    price: ogMeta(html, 'product:price:amount') || ogMeta(html, 'og:price:amount'),
    currency: ogMeta(html, 'product:price:currency') || ogMeta(html, 'og:price:currency'),
  };

  if (!draft) {
    if (!og.title && !og.price) return null;
    return {
      url,
      name: og.title || '',
      price_pkr: validatePrice(og.price, og.currency),
      image: og.image || '',
      description: og.description || '',
      rating: null,
      review_count: null,
      reviews: [],
      source: 'og',
    };
  }
  if (!draft.name && og.title) draft.name = og.title;
  if (!draft.image && og.image) draft.image = og.image;
  if (!draft.description && og.description) draft.description = og.description;
  if (draft.price_pkr == null && og.price) {
    const p = validatePrice(og.price, og.currency);
    if (p != null) draft.price_pkr = p;
  }
  return draft;
}

module.exports = { extractStructured, jsonLdNodes, ogMeta, isProduct };
