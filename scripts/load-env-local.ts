/**
 * Loads .env.local into process.env (existing variables win). Import it first,
 * before anything that reads the environment at import time, such as
 * src/server/db/supabase-admin.ts.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
