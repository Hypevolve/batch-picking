-- Migration: add author columns for book authors pulled from WooCommerce (import_autori)
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/nqrjhlpticqktpqmecrb/sql

ALTER TABLE batch_items ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_author_snapshot TEXT;
