const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const DB_PATH = path.join(__dirname, 'data', 'store.db');
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ── Seed admin user ──
async function seedAdmin() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
  if (existing.count > 0) {
    console.log('Admin user already exists, skipping...');
    return;
  }

  // Accept from args: node seed.js email password
  let email = process.argv[2] || process.env.ADMIN_EMAIL;
  let password = process.argv[3] || process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(r => rl.question(q, r));
    if (!email) email = await ask('Admin email: ');
    if (!password) password = await ask('Admin password: ');
    rl.close();
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)').run(email.toLowerCase().trim(), hash);
  console.log(`Admin user created: ${email}`);
}

// ── Seed products ──
function seedProducts() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (existing.count > 0) {
    console.log(`${existing.count} products already exist, skipping...`);
    return;
  }

  const CDN = 'https://countrysidestaples.com/cdn/shop/files';

  const products = [
    {
      name: 'Signature Everyday Hat', detail: 'Red & Cream', price_cents: 7000, category: 'hats',
      sizes: ['One Size'],
      image_primary: `${CDN}/countryside-staples-signature-red-cream-hat-nell-postman.jpg?v=1749767391&width=800`,
      image_hover: `${CDN}/countryside-staples-signature-red-cream-hat-nell.jpg?v=1749767422&width=800`,
      featured: 1, sort_order: 1,
    },
    {
      name: 'Signature Everyday Hat', detail: 'Navy & Cream', price_cents: 7000, category: 'hats',
      sizes: ['One Size'],
      image_primary: `${CDN}/countryside-staples-signature-navy-cream-hat-imogen-notaro.jpg?v=1749765054&width=800`,
      image_hover: `${CDN}/countryside-staples-signature-navy-cream-hat.jpg?v=1749765054&width=800`,
      featured: 1, sort_order: 2,
    },
    {
      name: 'Friends & Family Hat', detail: 'Cream & Crimson', price_cents: 7000, category: 'hats',
      sizes: ['One Size'],
      image_primary: `${CDN}/countryside-staples-friends-family-hat-julia-plumaker.jpg?v=1749766825&width=800`,
      image_hover: `${CDN}/countryside-staples-friends-family-hat-jordan-keiser.jpg?v=1749766825&width=800`,
      sort_order: 3,
    },
    {
      name: 'Signature Everyday Hat', detail: 'Royal Blue', price_cents: 7000, category: 'hats',
      sizes: ['One Size'],
      image_primary: `${CDN}/countryside-staples-signature-royalblue-hat.jpg?v=1762976536&width=800`,
      image_hover: `${CDN}/countryside-staples-signature-royal_blue-hat-back.jpg?v=1762976554&width=800`,
      sort_order: 4,
    },
    {
      name: 'Signature Miami Hat', detail: 'Miami Exclusive', price_cents: 7000, category: 'hats',
      sizes: ['One Size'],
      image_primary: `${CDN}/countryside-staples-signature-Miami-hat_d6433bcc-4b67-488a-ac53-b3eaaba29c63.jpg?v=1763011619&width=800`,
      image_hover: `${CDN}/countryside-staples-Miami-Exclusive-hat.jpg?v=1763011581&width=800`,
      sort_order: 5,
    },
    {
      name: 'Signature Everyday Hat', detail: 'Cardinal Red & Gold', price_cents: 7000, category: 'hats',
      sizes: ['One Size'],
      image_primary: `${CDN}/countryside-staples-cardinal_red-hat.jpg?v=1765830057&width=800`,
      image_hover: `${CDN}/countryside-staples-red-gold-hat-back.jpg?v=1765830044&width=800`,
      sort_order: 6,
    },
    {
      name: 'Everyday NYC Tee', detail: 'Heavyweight Cotton', price_cents: 5500, category: 'tops',
      sizes: ['XS','S','M','L','XL','XXL'],
      description: 'Our signature heavyweight cotton tee, designed in New York City. Features the Countryside Staples script logo with "New York City" detailing. Cut for an oversized, relaxed fit that drapes perfectly.',
      care: 'Machine wash cold with like colors. Tumble dry low. Do not bleach. Iron on low heat if needed. Do not dry clean.',
      design: '100% premium heavyweight cotton. 240 GSM. Oversized fit. Ribbed crew neck. Screen-printed script logo. Pre-shrunk. Designed in New York City.',
      image_primary: `${CDN}/countryside-staples-everyday-nyc-tee-imogen.jpg?v=1749765625&width=800`,
      image_hover: `${CDN}/countryside-staples-everyday-nyc-tee-samantha-ellery.jpg?v=1749765625&width=800`,
      featured: 1, sort_order: 7,
    },
    {
      name: 'Vintage Collegiate Hoodie', detail: 'Premium Heavyweight', price_cents: 12000, category: 'hoodies',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/countryside-staples-vintage-collegiate-hoodie-nell-postman.jpg?v=1749766326&width=800`,
      image_hover: `${CDN}/countryside-staples-vintage-collegiate-hoodie-julia-plumaker.jpg?v=1766359277&width=800`,
      featured: 1, sort_order: 8,
    },
    {
      name: 'Staff Only Hoodie', detail: 'Black', price_cents: 14500, category: 'hoodies',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/staff-only-black-hoodie.png?v=1770184187&width=800`,
      image_hover: `${CDN}/staff-only-black-hoodie.png?v=1770184187&width=800`,
      sort_order: 9,
    },
    {
      name: 'Staff Only Hoodie', detail: 'Faded Blue', price_cents: 14500, category: 'hoodies',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/staff-only-faded-blue-hoodie.png?v=1770184187&width=800`,
      image_hover: `${CDN}/staff-only-faded-blue-hoodie.png?v=1770184187&width=800`,
      sort_order: 10,
    },
    {
      name: 'Pastel Pink Long Sleeve', detail: 'Waffle Knit', price_cents: 8500, category: 'tops',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/Hayla_Pastel_Pink_Longsleeve.jpg?v=1775532815&width=800`,
      image_hover: `${CDN}/Daria_Pastel_Pink_On_Body.jpg?v=1775532815&width=800`,
      sort_order: 11,
    },
    {
      name: 'Pastel Pink Lounge Sweats', detail: 'Waffle Knit', price_cents: 12500, category: 'bottoms',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/Pastel_Pink_Dual_On_Body.jpg?v=1775512691&width=800`,
      image_hover: `${CDN}/Pastel_Pink_Lounge_Sweats_Bottoms_21af0444-3d84-4ea3-a2f4-24c829375639.jpg?v=1775533724&width=800`,
      sort_order: 12,
    },
    {
      name: 'Baby Blue Long Sleeve', detail: 'Waffle Knit', price_cents: 8500, category: 'tops',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/Dual_On_Body_Grace_Curley.jpg?v=1775531279&width=800`,
      image_hover: `${CDN}/Product_Baby_Blue_On_Body.jpg?v=1775533166&width=800`,
      sort_order: 13,
    },
    {
      name: 'Baby Blue Lounge Sweats', detail: 'Waffle Knit', price_cents: 12500, category: 'bottoms',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/Baby_Blue_Lounge_Sweats_Product.jpg?v=1775533776&width=800`,
      image_hover: `${CDN}/Guys_On_Body_Sweats.jpg?v=1775531279&width=800`,
      sort_order: 14,
    },
    {
      name: 'Waffle Knit Raglan', detail: 'Navy & White', price_cents: 8500, category: 'tops',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/white-navy-raglan-front-look.jpg?v=1766366260&width=800`,
      image_hover: `${CDN}/white-navy-raglan-front_42ae4828-1a02-437a-bac7-7aab4a41eaf9.jpg?v=1766366260&width=800`,
      sort_order: 15,
    },
    {
      name: 'Waffle Knit Oreo Raglan', detail: 'Black & White', price_cents: 8500, category: 'tops',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/oreoraglan-product-front.png?v=1769104857&width=800`,
      image_hover: `${CDN}/oreoraglan-product-front.png?v=1769104857&width=800`,
      sort_order: 16,
    },
    {
      name: 'Waffle Knit Raglan', detail: 'Wine Red', price_cents: 8500, category: 'tops',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/whiteburgundy-raglan-front.png?v=1769103705&width=800`,
      image_hover: `${CDN}/whiteburgundy-raglan-front.png?v=1769103705&width=800`,
      sort_order: 17,
    },
    {
      name: 'Lavender Lounge Sweats', detail: 'Waffle Knit', price_cents: 12500, category: 'bottoms',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/lavender-lounges-look-2.jpg?v=1766361070&width=800`,
      image_hover: `${CDN}/lavender-lounge-sweats-front.jpg?v=1766360202&width=800`,
      sort_order: 18,
    },
    {
      name: 'Cream Shorts', detail: 'Waffle Knit', price_cents: 7800, category: 'bottoms',
      sizes: ['XS','S','M','L','XL','XXL'],
      image_primary: `${CDN}/waffle-knit-shorts-front.jpg?v=1766363553&width=800`,
      image_hover: `${CDN}/waffle-knit-shorts-side-view.jpg?v=1766363553&width=800`,
      sort_order: 19,
    },
    {
      name: 'Ribbed Knit Tank Top', detail: "Women's", price_cents: 3500, category: 'tops',
      sizes: ['XS','S','M','L','XL'],
      image_primary: `${CDN}/ribbed-knit-tank-front.jpg?v=1766359626&width=800`,
      image_hover: `${CDN}/ribbed-tank-side-view.jpg?v=1766364790&width=800`,
      sort_order: 20,
    },
  ];

  const insert = db.prepare(`
    INSERT INTO products (name, slug, detail, price_cents, description, care, design, sizes, category, image_primary, image_hover, gallery, in_stock, featured, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 1, ?, ?)
  `);

  const slugCounts = {};
  const insertAll = db.transaction(() => {
    for (const p of products) {
      let base = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      if (p.detail) base += '-' + p.detail.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      slugCounts[base] = (slugCounts[base] || 0) + 1;
      const slug = slugCounts[base] > 1 ? `${base}-${slugCounts[base]}` : base;

      insert.run(
        p.name, slug, p.detail || '', p.price_cents,
        p.description || '', p.care || '', p.design || '',
        JSON.stringify(p.sizes || []),
        p.category, p.image_primary, p.image_hover,
        p.featured || 0, p.sort_order || 0
      );
    }
  });

  insertAll();
  console.log(`Seeded ${products.length} products.`);
}

// ── Run ──
async function main() {
  await seedAdmin();
  seedProducts();
  console.log('\nDone! Run: npm start');
  process.exit(0);
}

main();
