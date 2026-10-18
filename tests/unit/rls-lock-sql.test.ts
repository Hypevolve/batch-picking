import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The SQL that defines access: no allow-everything policy anywhere, and every
 * table in schema.sql is locked by both schema.sql and the 0003 migration.
 * (The migration was also run twice against PGlite with Supabase-like roles;
 * see docs/RLS-PRELAZAK.md.)
 */
const SUPABASE_DIR = path.resolve(__dirname, "../../supabase");
const schema = fs.readFileSync(path.join(SUPABASE_DIR, "schema.sql"), "utf8");
const migrationFile = path.join(SUPABASE_DIR, "migrations", "0003_lock_rls.sql");
const migration = fs.readFileSync(migrationFile, "utf8");
const allSql = [
  ["schema.sql", schema],
  ...fs
    .readdirSync(path.join(SUPABASE_DIR, "migrations"))
    .filter((f) => f.endsWith(".sql") && !f.startsWith("._"))
    .map((f) => [`migrations/${f}`, fs.readFileSync(path.join(SUPABASE_DIR, "migrations", f), "utf8")]),
] as Array<[string, string]>;

/** SQL without -- comments, so a comment that quotes the old policy does not count. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");
const tables = [...schema.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]);

describe("RLS lock SQL", () => {
  it("finds the tables (sanity check)", () => {
    expect(tables).toEqual(expect.arrayContaining(["users", "orders", "order_items", "batches", "activity_logs"]));
    expect(tables).toHaveLength(10);
  });

  it.each(allSql)("%s contains no USING (true) / WITH CHECK (true) and creates no policy", (_name, sql) => {
    expect(code(sql)).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(code(sql)).not.toMatch(/WITH\s+CHECK\s*\(\s*true\s*\)/i);
    expect(code(sql)).not.toMatch(/CREATE\s+POLICY/i);
  });

  it("schema.sql enables RLS on, and revokes anon/authenticated from, every table", () => {
    const sql = code(schema);
    const revoke = sql.match(/REVOKE ALL ON TABLE ([\s\S]*?)\s+FROM anon, authenticated, PUBLIC;/);
    const grant = sql.match(/GRANT ALL ON TABLE ([\s\S]*?)\s+TO service_role;/);
    const list = (m: RegExpMatchArray | null) => (m ? m[1].split(",").map((s) => s.trim()) : []);

    for (const t of tables) expect(sql).toContain(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    expect(list(revoke).sort()).toEqual([...tables].sort());
    expect(list(grant).sort()).toEqual([...tables].sort());
  });

  it("the migration covers every table and drops, enables, revokes and grants", () => {
    const sql = code(migration);
    const array = sql.match(/app_tables text\[\] := ARRAY\[([\s\S]*?)\]/);
    const listed = array ? [...array[1].matchAll(/'(\w+)'/g)].map((m) => m[1]) : [];

    expect(listed.sort()).toEqual([...tables].sort());
    expect(sql).toMatch(/DROP POLICY IF EXISTS/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.%I FROM anon, authenticated, PUBLIC/);
    expect(sql).toMatch(/GRANT ALL ON TABLE public\.%I TO service_role/);
  });

  it("the migration is safe to re-run (no CREATE, guarded by to_regclass and pg_policies)", () => {
    const sql = code(migration);
    expect(sql).not.toMatch(/\bCREATE\s+(TABLE|POLICY|TYPE|ROLE)\b/i);
    expect(sql).toContain("to_regclass");
    expect(sql).toContain("FROM pg_policies");
  });
});
