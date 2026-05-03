const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const cookieSession = require('cookie-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sendMail, verifyEmailTemplate, resetPasswordTemplate } = require('./mailer');

// ── Config ──
const PORT = process.env.PORT || 3000;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PUBLISHABLE = process.env.STRIPE_PUBLISHABLE_KEY || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET must be set in production.');
  process.exit(1);
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h to confirm email

// ── Database ──
const DB_PATH = path.join(__dirname, 'data', 'store.db');
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrations — add columns that may not exist
try { db.exec('ALTER TABLE products ADD COLUMN archived INTEGER DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN size_chart TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN size_chart_enabled INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN size_chart_type TEXT DEFAULT ''"); } catch {}
// Backfill: rows that were never explicitly configured (no chart type set) get the default ON
try { db.exec("UPDATE products SET size_chart_enabled = 1, size_chart_type = 'shirt' WHERE (size_chart_type IS NULL OR size_chart_type = '') AND size_chart_enabled = 0"); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN care_enabled INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE products ADD COLUMN care_type TEXT DEFAULT ''"); } catch {}

// Email verification tokens. Hash is stored, never the raw token.
db.exec(`CREATE TABLE IF NOT EXISTS email_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  purpose TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_tokens(token_hash)');
// Drop the older login_tokens table from a previous iteration if present.
try { db.exec('DROP TABLE IF EXISTS login_tokens'); } catch {}
try { db.exec('ALTER TABLE customers ADD COLUMN email_verified INTEGER DEFAULT 0'); } catch {}
// Existing customers (created before verification existed) are grandfathered
// in as verified so we don't lock anyone out.
try { db.exec("UPDATE customers SET email_verified = 1 WHERE email_verified IS NULL OR email_verified = 0"); } catch {}
try {
  const exists = db.prepare("SELECT value FROM site_config WHERE key = 'care_instructions'").get();
  if (!exists) {
    const defaults = {
      cotton: 'Machine wash cold with like colors. Tumble dry low. Do not bleach. Iron on low heat if needed. Do not dry clean.',
      waffle: 'Machine wash cold inside out. Lay flat to dry to preserve texture. Do not bleach. Iron on low if needed. Do not dry clean.',
      hoodie: 'Machine wash cold inside out with like colors. Tumble dry low or hang dry. Do not bleach. Wash separately first time.',
      hat: 'Spot clean only. Do not machine wash. Reshape and air dry. Avoid prolonged sun exposure.',
    };
    db.prepare("INSERT INTO site_config (key, value) VALUES ('care_instructions', ?)").run(JSON.stringify(defaults));
  }
} catch {}
try {
  const exists = db.prepare("SELECT value FROM site_config WHERE key = 'size_charts'").get();
  if (!exists) {
    const defaults = {
      shirt: 'Size | Chest | Length | Sleeve\nXS | 17 | 26 | 7.5\nS  | 18 | 27 | 8\nM  | 20 | 28 | 8.5\nL  | 22 | 29 | 9\nXL | 24 | 30 | 9.5\nXXL| 26 | 31 | 10',
      hoodie: 'Size | Chest | Length | Sleeve\nXS | 20 | 27 | 24\nS  | 21 | 28 | 24.5\nM  | 23 | 29 | 25\nL  | 25 | 30 | 25.5\nXL | 27 | 31 | 26\nXXL| 29 | 32 | 26.5',
      pants: 'Size | Waist | Inseam | Outseam\nXS | 26 | 30 | 39\nS  | 28 | 30 | 39\nM  | 30 | 31 | 40\nL  | 32 | 31 | 40\nXL | 34 | 32 | 41\nXXL| 36 | 32 | 41',
      hat: 'One Size | Circumference | Adjustable\nOS | 22-24" | Yes',
    };
    db.prepare("INSERT INTO site_config (key, value) VALUES ('size_charts', ?)").run(JSON.stringify(defaults));
  }
} catch {}
try { db.exec("INSERT OR IGNORE INTO site_config (key, value) VALUES ('featured_ids', '[]')"); } catch {}
try { db.exec("INSERT OR IGNORE INTO site_config (key, value) VALUES ('best_sellers', '{\"product_ids\":[]}')"); } catch {}

// ── Stripe (lazy — only if key is set) ──
let stripe = null;
if (STRIPE_SECRET) {
  stripe = require('stripe')(STRIPE_SECRET);
}

// ── App ──
const app = express();

// Stripe webhook needs raw body — must come before json parser
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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

      // Fetch line items from Stripe (not included in webhook payload)
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        const insertItem = db.prepare(`
          INSERT INTO order_items (order_id, product_id, product_name, size, quantity, price_cents)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const item of lineItems.data) {
          // metadata.product_id and metadata.size are set when creating the checkout session
          const productId = item.price?.metadata?.product_id || null;
          const size = item.price?.metadata?.size || '';
          insertItem.run(
            result.lastInsertRowid,
            productId,
            item.description || '',
            size,
            item.quantity || 1,
            item.amount_total || 0
          );
        }
      } catch (err) {
        console.error('Failed to fetch line items:', err.message);
      }
    }
  }

  res.json({ received: true });
});

app.use(express.json());
app.get(['/admin', '/admin/'], (req, res) => res.redirect('/admin.html'));
app.use(express.static(path.join(__dirname, 'public')));
// Serve main site files from parent directory
app.use(express.static(path.join(__dirname, '..')));

app.set('trust proxy', 1);
app.use(cookieSession({
  name: 'css_admin',
  secret: SESSION_SECRET,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  httpOnly: true,
  sameSite: 'lax',
  secure: IS_PROD,
}));

// ── Auth middleware ──
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// ── Rate limiter (in-memory, per IP+key) ──
// Sliding window. Sized for a single-process Node app — if you ever scale
// horizontally, swap for Redis or a fronting proxy limiter.
const rateBuckets = new Map();
function rateLimit({ key, max, windowMs }) {
  const now = Date.now();
  const slot = rateBuckets.get(key) || [];
  const fresh = slot.filter(t => now - t < windowMs);
  if (fresh.length >= max) {
    rateBuckets.set(key, fresh);
    return { ok: false, retryMs: windowMs - (now - fresh[0]) };
  }
  fresh.push(now);
  rateBuckets.set(key, fresh);
  return { ok: true };
}
function clientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.ip || req.socket.remoteAddress || 'unknown';
}
function loginLimiter(prefix) {
  return (req, res, next) => {
    const ip = clientIp(req);
    const email = (req.body?.email || '').toLowerCase().trim();
    const ipCheck = rateLimit({ key: `${prefix}:ip:${ip}`, max: 20, windowMs: 15 * 60 * 1000 });
    if (!ipCheck.ok) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    if (email) {
      const emailCheck = rateLimit({ key: `${prefix}:email:${email}`, max: 8, windowMs: 15 * 60 * 1000 });
      if (!emailCheck.ok) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    next();
  };
}

// ── Email-token helpers (verify-email, reset-password) ──
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
function issueToken({ purpose, email, ttlMs, path, extra }) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = hashToken(raw);
  const now = Date.now();
  db.prepare(
    'INSERT INTO email_tokens (token_hash, purpose, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(hash, purpose, email, now + ttlMs, now);
  db.prepare('DELETE FROM email_tokens WHERE expires_at < ?').run(now - 7 * 24 * 60 * 60 * 1000);
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('token', raw);
  for (const [k, v] of Object.entries(extra || {})) url.searchParams.set(k, v);
  return url.toString();
}
function consumeToken({ rawToken, purpose }) {
  if (!rawToken) return { error: 'Missing token' };
  const hash = hashToken(rawToken);
  const row = db.prepare('SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = ?').get(hash, purpose);
  if (!row) return { error: 'Invalid or expired link' };
  if (row.used_at) return { error: 'This link has already been used' };
  if (row.expires_at < Date.now()) return { error: 'This link has expired' };
  db.prepare('UPDATE email_tokens SET used_at = ? WHERE id = ?').run(Date.now(), row.id);
  return { email: row.email };
}
function safeRedirect(target) {
  if (!target || typeof target !== 'string') return null;
  // Only allow same-origin relative paths — never open redirects.
  if (!target.startsWith('/') || target.startsWith('//')) return null;
  return target;
}

// ── Auth routes ──
app.post('/api/login', loginLimiter('admin-pw'), (req, res) => {
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

// ── Site config routes ──
app.get('/api/config/:key', requireAuth, (req, res) => {
  const row = db.prepare('SELECT value FROM site_config WHERE key = ?').get(req.params.key);
  res.json({ key: req.params.key, value: row ? JSON.parse(row.value) : null });
});

app.put('/api/config/:key', requireAuth, (req, res) => {
  const { value } = req.body;
  db.prepare('INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)').run(req.params.key, JSON.stringify(value));
  res.json({ ok: true });
});

app.get('/api/best-sellers/suggestions', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT oi.product_id AS id, SUM(oi.quantity) AS qty
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE p.archived = 0 AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
    ORDER BY qty DESC, oi.product_id ASC
    LIMIT 20
  `).all();
  res.json({ product_ids: rows.map(r => r.id) });
});

// ── Product routes ──
app.get('/api/products', requireAuth, (req, res) => {
  const show = req.query.archived === '1' ? 1 : 0;
  const products = db.prepare('SELECT * FROM products WHERE archived = ? ORDER BY sort_order, created_at DESC').all(show);
  res.json(products);
});

app.post('/api/products', requireAuth, (req, res) => {
  const { name, detail, price_cents, description, care, design, sizes, category, image_primary, image_hover, gallery, size_chart_enabled, size_chart_type, care_enabled, care_type, in_stock, featured, sort_order } = req.body;
  if (!name || !price_cents) return res.status(400).json({ error: 'Name and price required' });

  const slug = (req.body.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  // Ensure unique slug
  let finalSlug = slug;
  let counter = 1;
  while (db.prepare('SELECT id FROM products WHERE slug = ?').get(finalSlug)) {
    finalSlug = `${slug}-${counter++}`;
  }

  const result = db.prepare(`
    INSERT INTO products (name, slug, detail, price_cents, description, care, design, sizes, category, image_primary, image_hover, gallery, size_chart_enabled, size_chart_type, care_enabled, care_type, in_stock, featured, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, finalSlug, detail || '', price_cents, description || '', care || '', design || '',
    JSON.stringify(sizes || ['XS','S','M','L','XL','XXL']),
    category || 'tops', image_primary || '', image_hover || '',
    JSON.stringify(gallery || []),
    size_chart_enabled === undefined ? 1 : (size_chart_enabled ? 1 : 0),
    size_chart_type || 'shirt',
    care_enabled ? 1 : 0,
    care_type || 'cotton',
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

  const { name, slug, detail, price_cents, description, care, design, sizes, category, image_primary, image_hover, gallery, size_chart_enabled, size_chart_type, care_enabled, care_type, in_stock, featured, sort_order } = req.body;

  db.prepare(`
    UPDATE products SET name=?, slug=?, detail=?, price_cents=?, description=?, care=?, design=?, sizes=?, category=?, image_primary=?, image_hover=?, gallery=?, size_chart_enabled=?, size_chart_type=?, care_enabled=?, care_type=?, in_stock=?, featured=?, sort_order=?
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
    size_chart_enabled !== undefined ? (size_chart_enabled ? 1 : 0) : existing.size_chart_enabled,
    size_chart_type ?? existing.size_chart_type,
    care_enabled !== undefined ? (care_enabled ? 1 : 0) : existing.care_enabled,
    care_type ?? existing.care_type,
    in_stock !== undefined ? (in_stock ? 1 : 0) : existing.in_stock,
    featured !== undefined ? (featured ? 1 : 0) : existing.featured,
    sort_order ?? existing.sort_order,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(updated);
});

app.put('/api/products/:id/archive', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const newState = existing.archived ? 0 : 1;
  db.prepare('UPDATE products SET archived = ? WHERE id = ?').run(newState, req.params.id);
  res.json({ ok: true, archived: newState });
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

// ── Customer auth (public) ──

// Build + send the verify-email message. Caller decides whether to expose
// the dev link (signup/resend yes; login challenge yes — same email).
async function sendVerifyEmail(email) {
  const link = issueToken({
    purpose: 'verify-email',
    email,
    ttlMs: VERIFY_TOKEN_TTL_MS,
    path: '/api/account/verify-email',
    extra: { redirect: '/account.html' },
  });
  const tpl = verifyEmailTemplate({ link });
  return sendMail({ to: email, devLink: link, ...tpl });
}

app.post('/api/account/signup', loginLimiter('cust-signup'), async (req, res) => {
  const { email: rawEmail, password, first_name, last_name } = req.body;
  if (!rawEmail || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const email = rawEmail.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });

  const existing = db.prepare('SELECT id, email_verified FROM customers WHERE email = ?').get(email);
  if (existing) {
    // If they previously signed up but never verified, let them resend rather
    // than getting stuck. Don't reveal that the email already exists otherwise.
    if (!existing.email_verified) {
      try {
        const result = await sendVerifyEmail(email);
        const dev = !IS_PROD;
        return res.json({ ok: true, pending_verification: true, ...(dev && result.devLink ? { devLink: result.devLink } : {}) });
      } catch (err) {
        console.error('Verify email send failed:', err.message);
        return res.status(500).json({ error: 'Could not send verification email' });
      }
    }
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO customers (email, password_hash, first_name, last_name, email_verified) VALUES (?, ?, ?, ?, 0)'
  ).run(email, hash, first_name || '', last_name || '');

  try {
    const result = await sendVerifyEmail(email);
    const dev = !IS_PROD;
    res.json({ ok: true, pending_verification: true, ...(dev && result.devLink ? { devLink: result.devLink } : {}) });
  } catch (err) {
    console.error('Verify email send failed:', err.message);
    res.status(500).json({ error: 'Account created but could not send verification email. Try resending.' });
  }
});

app.post('/api/account/login', loginLimiter('cust-pw'), (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.toLowerCase().trim());
  if (!customer || !bcrypt.compareSync(password, customer.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!customer.email_verified) {
    return res.status(403).json({ error: 'Please verify your email first', needs_verification: true });
  }

  req.session.customerId = customer.id;
  res.json({ ok: true, customer: { id: customer.id, email: customer.email, first_name: customer.first_name, last_name: customer.last_name } });
});

app.post('/api/account/resend-verification', loginLimiter('cust-resend'), async (req, res) => {
  const email = (req.body?.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Email required' });
  const customer = db.prepare('SELECT email, email_verified FROM customers WHERE email = ?').get(email);
  const dev = !IS_PROD;
  // Generic response — never reveal whether the email exists.
  if (!customer || customer.email_verified) return res.json({ ok: true });
  try {
    const result = await sendVerifyEmail(customer.email);
    res.json({ ok: true, ...(dev && result.devLink ? { devLink: result.devLink } : {}) });
  } catch (err) {
    console.error('Resend verification failed:', err.message);
    res.status(500).json({ error: 'Could not send verification email' });
  }
});

app.get('/api/account/verify-email', (req, res) => {
  const result = consumeToken({ rawToken: req.query.token, purpose: 'verify-email' });
  if (result.error) return res.status(400).send(result.error);
  const customer = db.prepare('SELECT id FROM customers WHERE email = ?').get(result.email);
  if (!customer) return res.status(400).send('Account no longer exists');
  db.prepare('UPDATE customers SET email_verified = 1 WHERE id = ?').run(customer.id);
  req.session.customerId = customer.id;
  res.redirect(safeRedirect(req.query.redirect) || '/account.html');
});

// ── Forgot password / reset ──
app.post('/api/account/forgot-password', loginLimiter('cust-forgot'), async (req, res) => {
  const email = (req.body?.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Email required' });
  const customer = db.prepare('SELECT email FROM customers WHERE email = ?').get(email);
  const dev = !IS_PROD;
  // Generic ok — no enumeration.
  if (!customer) return res.json({ ok: true });

  const link = issueToken({
    purpose: 'reset-password',
    email: customer.email,
    ttlMs: 60 * 60 * 1000, // 1h
    path: '/account.html',
    extra: { mode: 'reset' },
  });
  try {
    const tpl = resetPasswordTemplate({ link });
    const result = await sendMail({ to: customer.email, devLink: link, ...tpl });
    res.json({ ok: true, ...(dev && result.devLink ? { devLink: result.devLink } : {}) });
  } catch (err) {
    console.error('Reset email send failed:', err.message);
    res.status(500).json({ error: 'Could not send reset email' });
  }
});

app.post('/api/account/reset-password', loginLimiter('cust-reset'), (req, res) => {
  const { token, password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const result = consumeToken({ rawToken: token, purpose: 'reset-password' });
  if (result.error) return res.status(400).json({ error: result.error });
  const customer = db.prepare('SELECT id, email FROM customers WHERE email = ?').get(result.email);
  if (!customer) return res.status(400).json({ error: 'Account no longer exists' });

  const hash = bcrypt.hashSync(password, 10);
  // Resetting via emailed link also confirms ownership of the address.
  db.prepare('UPDATE customers SET password_hash = ?, email_verified = 1 WHERE id = ?').run(hash, customer.id);
  req.session.customerId = customer.id;
  res.json({ ok: true, customer: { id: customer.id, email: customer.email } });
});

app.post('/api/account/logout', (req, res) => {
  req.session.customerId = null;
  res.json({ ok: true });
});

app.get('/api/account/me', (req, res) => {
  if (!req.session.customerId) return res.status(401).json({ error: 'Not signed in' });
  const customer = db.prepare('SELECT id, email, first_name, last_name, created_at FROM customers WHERE id = ?').get(req.session.customerId);
  if (!customer) { req.session.customerId = null; return res.status(401).json({ error: 'Not signed in' }); }
  res.json(customer);
});

app.get('/api/account/orders', (req, res) => {
  if (!req.session.customerId) return res.status(401).json({ error: 'Not signed in' });
  const customer = db.prepare('SELECT email FROM customers WHERE id = ?').get(req.session.customerId);
  if (!customer) return res.status(401).json({ error: 'Not signed in' });
  const orders = db.prepare('SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC').all(customer.email);
  res.json(orders);
});

// ── Stripe checkout (no auth — customers use this) ──
app.get('/api/stripe/config', (req, res) => {
  res.json({ publishableKey: STRIPE_PUBLISHABLE, configured: !!STRIPE_SECRET });
});

app.post('/api/checkout', async (req, res) => {
  if (!stripe) return res.status(400).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY.' });

  const { items } = req.body;
  // items: [{ slug, size, quantity }]
  if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty' });

  // Look up products and build line items
  const getProduct = db.prepare('SELECT * FROM products WHERE slug = ?');
  const lineItems = [];

  for (const item of items) {
    const product = getProduct.get(item.slug);
    if (!product) continue;

    lineItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: product.price_cents,
        product_data: {
          name: product.name + (item.size ? ` — ${item.size}` : ''),
          description: product.detail || undefined,
          images: product.image_primary ? [product.image_primary] : undefined,
          metadata: {
            product_id: String(product.id),
            size: item.size || '',
          },
        },
      },
      quantity: item.quantity || 1,
    });
  }

  if (!lineItems.length) return res.status(400).json({ error: 'No valid products in cart' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
      success_url: `${BASE_URL}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/shop.html`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── Public storefront API (no auth) ──
app.get('/api/storefront/lookbook', (req, res) => {
  const row = db.prepare("SELECT value FROM site_config WHERE key = 'lookbook'").get();
  res.json(row ? JSON.parse(row.value) : { title: '', label: '', product_ids: [] });
});

app.get('/api/storefront/size-charts', (req, res) => {
  const row = db.prepare("SELECT value FROM site_config WHERE key = 'size_charts'").get();
  res.json(row ? JSON.parse(row.value) : {});
});

app.get('/api/storefront/care-instructions', (req, res) => {
  const row = db.prepare("SELECT value FROM site_config WHERE key = 'care_instructions'").get();
  res.json(row ? JSON.parse(row.value) : {});
});

app.get('/api/storefront/new-arrivals', (req, res) => {
  const row = db.prepare("SELECT value FROM site_config WHERE key = 'new_arrivals'").get();
  res.json(row ? JSON.parse(row.value) : { title: '', label: '', product_ids: [] });
});

app.get('/api/storefront/best-sellers', (req, res) => {
  const row = db.prepare("SELECT value FROM site_config WHERE key = 'best_sellers'").get();
  res.json(row ? JSON.parse(row.value) : { product_ids: [] });
});

app.get('/api/storefront/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE in_stock = 1 AND archived = 0 ORDER BY sort_order, created_at DESC').all();
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
