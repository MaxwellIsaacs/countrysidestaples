const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const cookieSession = require('cookie-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Config ──
const PORT = process.env.PORT || 3000;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// ── Database ──
const DB_PATH = path.join(__dirname, 'data', 'store.db');
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ── Stripe (lazy — only if key is set) ──
let stripe = null;
if (STRIPE_SECRET) {
  stripe = require('stripe')(STRIPE_SECRET);
}

// ── App ──
const app = express();

// Stripe webhook needs raw body — must come before json parser
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(400).json({ error: 'Stripe not configured' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const existing = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(session.id);
    if (!existing) {
      const result = db.prepare(`
        INSERT INTO orders (stripe_session_id, stripe_payment_intent, customer_email, customer_name, shipping_address, total_cents)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        session.id,
        session.payment_intent || '',
        session.customer_details?.email || '',
        session.customer_details?.name || '',
        JSON.stringify(session.shipping_details?.address || {}),
        session.amount_total || 0
      );

      // Insert line items if available
      if (session.line_items?.data) {
        const insertItem = db.prepare(`
          INSERT INTO order_items (order_id, product_name, quantity, price_cents)
          VALUES (?, ?, ?, ?)
        `);
        for (const item of session.line_items.data) {
          insertItem.run(result.lastInsertRowid, item.description || '', item.quantity || 1, item.amount_total || 0);
        }
      }
    }
  }

  res.json({ received: true });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Serve main site files from parent directory
app.use(express.static(path.join(__dirname, '..')));

app.use(cookieSession({
  name: 'css_admin',
  secret: SESSION_SECRET,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  httpOnly: true,
  sameSite: 'lax',
}));

// ── Auth middleware ──
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// ── Auth routes ──
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  res.json({ ok: true, email: user.email });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT id, email FROM admin_users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(user);
});

// ── Dashboard stats ──
app.get('/api/stats', requireAuth, (req, res) => {
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const newOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'new'").get().count;
  const revenue = db.prepare('SELECT COALESCE(SUM(total_cents), 0) as total FROM orders').get().total;
  res.json({ totalProducts, totalOrders, newOrders, revenue });
});

// ── Product routes ──
app.get('/api/products', requireAuth, (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY sort_order, created_at DESC').all();
  res.json(products);
});

app.post('/api/products', requireAuth, (req, res) => {
  const { name, detail, price_cents, description, care, design, sizes, category, image_primary, image_hover, gallery, in_stock, featured, sort_order } = req.body;
  if (!name || !price_cents) return res.status(400).json({ error: 'Name and price required' });

  const slug = (req.body.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  // Ensure unique slug
  let finalSlug = slug;
  let counter = 1;
  while (db.prepare('SELECT id FROM products WHERE slug = ?').get(finalSlug)) {
    finalSlug = `${slug}-${counter++}`;
  }

  const result = db.prepare(`
    INSERT INTO products (name, slug, detail, price_cents, description, care, design, sizes, category, image_primary, image_hover, gallery, in_stock, featured, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, finalSlug, detail || '', price_cents, description || '', care || '', design || '',
    JSON.stringify(sizes || ['XS','S','M','L','XL','XXL']),
    category || 'tops', image_primary || '', image_hover || '',
    JSON.stringify(gallery || []),
    in_stock !== undefined ? (in_stock ? 1 : 0) : 1,
    featured ? 1 : 0,
    sort_order || 0
  );

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.json(product);
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, slug, detail, price_cents, description, care, design, sizes, category, image_primary, image_hover, gallery, in_stock, featured, sort_order } = req.body;

  db.prepare(`
    UPDATE products SET name=?, slug=?, detail=?, price_cents=?, description=?, care=?, design=?, sizes=?, category=?, image_primary=?, image_hover=?, gallery=?, in_stock=?, featured=?, sort_order=?
    WHERE id=?
  `).run(
    name ?? existing.name,
    slug ?? existing.slug,
    detail ?? existing.detail,
    price_cents ?? existing.price_cents,
    description ?? existing.description,
    care ?? existing.care,
    design ?? existing.design,
    sizes !== undefined ? JSON.stringify(sizes) : existing.sizes,
    category ?? existing.category,
    image_primary ?? existing.image_primary,
    image_hover ?? existing.image_hover,
    gallery !== undefined ? JSON.stringify(gallery) : existing.gallery,
    in_stock !== undefined ? (in_stock ? 1 : 0) : existing.in_stock,
    featured !== undefined ? (featured ? 1 : 0) : existing.featured,
    sort_order ?? existing.sort_order,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Order routes ──
app.get('/api/orders', requireAuth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(orders);
});

app.get('/api/orders/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
  res.json({ ...order, items });
});

app.put('/api/orders/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const valid = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── Public storefront API (no auth) ──
app.get('/api/storefront/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE in_stock = 1 ORDER BY sort_order, created_at DESC').all();
  res.json(products);
});

app.get('/api/storefront/products/:slug', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE slug = ?').get(req.params.slug);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

// ── Start ──
app.listen(PORT, () => {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get().count;
  console.log(`\n  Countryside Staples Admin`);
  console.log(`  http://localhost:${PORT}/admin.html\n`);
  if (userCount === 0) {
    console.log('  ⚠  No admin user yet. Run: npm run seed\n');
  }
  if (!STRIPE_SECRET) {
    console.log('  ⚠  STRIPE_SECRET_KEY not set — webhooks disabled\n');
  }
});
