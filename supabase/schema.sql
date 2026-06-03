-- Batch Picking Schema
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/nqrjhlpticqktpqmecrb/sql)

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'picker');
CREATE TYPE order_status AS ENUM ('pending_batch', 'batched', 'picked', 'packed', 'synced');
CREATE TYPE batch_type AS ENUM ('smart', 'mixed', 'partial');
CREATE TYPE batch_status AS ENUM ('draft', 'ready', 'in_progress', 'picked', 'packed', 'synced');
CREATE TYPE basket_label AS ENUM ('A', 'B', 'C', 'D', 'E');

-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'picker',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  woo_product_id INTEGER UNIQUE,
  sku VARCHAR(100) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  image_url TEXT,
  author TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_sku_idx ON products(sku);

-- Product locations (shelf mapping)
CREATE TABLE product_locations (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) NOT NULL REFERENCES products(sku),
  zone_code VARCHAR(50) NOT NULL,
  shelf_code VARCHAR(50) NOT NULL,
  route_position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Picking routes (zone configuration)
CREATE TABLE picking_routes (
  id SERIAL PRIMARY KEY,
  zone_code VARCHAR(50) NOT NULL UNIQUE,
  zone_name VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  woo_order_id INTEGER NOT NULL UNIQUE,
  customer_name VARCHAR(255) NOT NULL,
  status order_status NOT NULL DEFAULT 'pending_batch',
  woo_status VARCHAR(50) NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX orders_woo_order_id_idx ON orders(woo_order_id);

-- Order items
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  product_title_snapshot TEXT,
  product_image_snapshot TEXT,
  product_author_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Batches
CREATE TABLE batches (
  id SERIAL PRIMARY KEY,
  batch_code VARCHAR(50) NOT NULL UNIQUE,
  batch_type batch_type NOT NULL DEFAULT 'mixed',
  similarity_score REAL DEFAULT 0,
  status batch_status NOT NULL DEFAULT 'draft',
  order_count INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Batch-order mapping
CREATE TABLE batch_orders (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  basket_label basket_label NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Batch items (consolidated picking list)
CREATE TABLE batch_items (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  product_title TEXT,
  product_image_url TEXT,
  author TEXT,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  basket_breakdown JSONB,
  route_position INTEGER NOT NULL DEFAULT 0,
  zone_code VARCHAR(50),
  shelf_code VARCHAR(50),
  is_picked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity logs
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER NOT NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE picking_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Allow full access for authenticated users (we handle auth in the app layer)
CREATE POLICY "Allow all for authenticated" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON product_locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON picking_routes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON batches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON batch_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON batch_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON activity_logs FOR ALL USING (true) WITH CHECK (true);

-- Seed: create default admin user (password: admin123)
INSERT INTO users (email, name, password_hash, role) VALUES (
  'admin@libar.hr',
  'Admin',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  'admin'
);

-- Seed: create default picker user (password: picker123)
INSERT INTO users (email, name, password_hash, role) VALUES (
  'picker@libar.hr',
  'Picker',
  '5a7e575cadc6c94e81d64754326ff66e9e6d570a0588b1e5bf8fb1e210045487',
  'picker'
);
