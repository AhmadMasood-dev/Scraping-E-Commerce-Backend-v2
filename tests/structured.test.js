process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractStructured } = require('../src/extract/structured');

const ldBlock = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

test('single Product with offers → full draft', () => {
  const html = ldBlock({
    '@type': 'Product',
    name: 'Apple iPhone 17 Pro Max 256GB',
    image: 'https://priceoye.pk/img/x.jpg',
    description: '6.9-inch, A19 Pro',
    offers: { '@type': 'Offer', price: '489999', priceCurrency: 'PKR' },
    aggregateRating: { ratingValue: '4.6', reviewCount: '128' },
  });
  const d = extractStructured('https://priceoye.pk/p/1', html);
  assert.equal(d.name, 'Apple iPhone 17 Pro Max 256GB');
  assert.equal(d.price_pkr, 489999);
  assert.equal(d.image, 'https://priceoye.pk/img/x.jpg');
  assert.equal(d.rating, 4.6);
  assert.equal(d.review_count, 128);
  assert.equal(d.source, 'jsonld');
});

test('Product inside @graph is found', () => {
  const html = ldBlock({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: 'Store' },
      { '@type': 'Product', name: 'Galaxy S24 Ultra', offers: { price: 316999, priceCurrency: 'PKR' } },
    ],
  });
  const d = extractStructured('https://x.pk/p', html);
  assert.equal(d.name, 'Galaxy S24 Ultra');
  assert.equal(d.price_pkr, 316999);
});

test('offers array → lowest price', () => {
  const html = ldBlock({
    '@type': 'Product',
    name: 'Phone',
    offers: [{ price: 550000, priceCurrency: 'PKR' }, { price: 489999, priceCurrency: 'PKR' }],
  });
  assert.equal(extractStructured('https://x.pk/p', html).price_pkr, 489999);
});

test('listing page (ItemList or >1 Product) → { listing: true }', () => {
  const two =
    ldBlock({ '@type': 'Product', name: 'A', offers: { price: 100000 } }) +
    ldBlock({ '@type': 'Product', name: 'B', offers: { price: 200000 } });
  assert.deepEqual(extractStructured('https://x.pk/list', two), { listing: true });

  const itemList = ldBlock({ '@type': 'ItemList', itemListElement: [] });
  assert.deepEqual(extractStructured('https://x.pk/list', itemList), { listing: true });
});

test('no JSON-LD but OpenGraph present → og draft', () => {
  const html = `
    <meta property="og:title" content="Xiaomi Redmi 15" />
    <meta property="og:image" content="https://x.pk/r.jpg" />
    <meta property="product:price:amount" content="55999" />
    <meta property="product:price:currency" content="PKR" />`;
  const d = extractStructured('https://x.pk/p', html);
  assert.equal(d.name, 'Xiaomi Redmi 15');
  assert.equal(d.price_pkr, 55999);
  assert.equal(d.image, 'https://x.pk/r.jpg');
  assert.equal(d.source, 'og');
});

test('OpenGraph fills a gap when JSON-LD lacks price', () => {
  const html =
    ldBlock({ '@type': 'Product', name: 'Watch', image: 'https://x.pk/w.jpg' }) + // no offers
    `<meta property="product:price:amount" content="34999"><meta property="product:price:currency" content="PKR">`;
  const d = extractStructured('https://x.pk/p', html);
  assert.equal(d.name, 'Watch');
  assert.equal(d.price_pkr, 34999);
});

test('empty / non-product html → null', () => {
  assert.equal(extractStructured('https://x.pk/p', '<html><body>hi</body></html>'), null);
});
