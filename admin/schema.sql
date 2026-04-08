CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  detail TEXT DEFAULT '',
  price_cents INTEGER NOT NULL,
  description TEXT DEFAULT '',
  care TEXT DEFAULT '',
  design TEXT DEFAULT '',
  sizes TEXT DEFAULT '["XS","S","M","L","XL","XXL"]',
  category TEXT DEFAULT 'tops',
  image_primary TEXT DEFAULT '',
  image_hover TEXT DEFAULT '',
  gallery TEXT DEFAULT '[]',
  in_stock INTEGER DEFAULT 1,
  featured INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  customer_email TEXT NOT NULL,
  customer_name TEXT DEFAULT '',
  shipping_address TEXT DEFAULT '{}',
  status TEXT DEFAULT 'new' CHECK(status IN ('new','processing','shipped','delivered','cancelled')),
  total_cents INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  size TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  price_cents INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
