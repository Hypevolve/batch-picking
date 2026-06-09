-- Add missing picking route zones (safe to re-run)
INSERT INTO picking_routes (zone_code, zone_name, sort_order)
VALUES
  ('ZONA-D', 'ZONA-D', 4),
  ('ZONA-E', 'ZONA-E', 5),
  ('ZONA-F', 'ZONA-F', 6),
  ('ZONA-G', 'ZONA-G', 7)
ON CONFLICT (zone_code) DO NOTHING;
