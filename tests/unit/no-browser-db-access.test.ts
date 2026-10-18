import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The browser must not talk to Supabase: no Supabase client, no table access,
 * no realtime channel in client code, and the publishable key read only by the
 * server client's transition fallback.
 */
const ROOT = path.resolve(__dirname, "../..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(e.name) && !e.name.startsWith("._") ? [full] : [];
  });
}

const rel = (f: string) => path.relative(ROOT, f);
const sourceFiles = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts"))];
const read = (f: string) => fs.readFileSync(f, "utf8");
const isClientComponent = (code: string) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(code);
/** Non-type imports: `import x from "m"`, `import "m"`, `export … from "m"`. */
const runtimeImports = (code: string) =>
  [...code.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^;"']*?\sfrom\s+)?["']([^"']+)["']/gm)].map((m) => m[1]);

describe("no direct database access from the browser", () => {
  const clientFiles = sourceFiles.filter((f) => isClientComponent(read(f)));

  it("finds the client components (sanity check)", () => {
    expect(clientFiles.map(rel)).toEqual(
      expect.arrayContaining([
        "src/app/(picker)/pick/page.tsx",
        "src/app/(picker)/pick/[id]/page.tsx",
        "src/app/(admin)/dashboard/page.tsx",
        "src/app/(admin)/orders/page.tsx",
        "src/app/(admin)/batches/page.tsx",
        "src/app/(admin)/batches/[id]/page.tsx",
        "src/app/(admin)/locations/page.tsx",
        "src/app/(admin)/users/page.tsx",
      ])
    );
  });

  it("client components import no Supabase client and no server module", () => {
    const offenders = clientFiles.flatMap((f) =>
      runtimeImports(read(f))
        .filter((m) => m.startsWith("@supabase/") || m.includes("utils/supabase") || m.startsWith("@/server/"))
        .map((m) => `${rel(f)} imports ${m}`)
    );
    expect(offenders).toEqual([]);
  });

  it("no browser or SSR Supabase client exists anywhere in the app", () => {
    const offenders = sourceFiles
      .filter((f) => /createBrowserClient|createServerClient|@supabase\/ssr/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("only the server client creates a Supabase client or reads the publishable key", () => {
    const offenders = sourceFiles
      .filter((f) => rel(f) !== path.join("src", "server", "db", "supabase-admin.ts"))
      .filter((f) => {
        const code = read(f);
        const createsClient = /from ["']@supabase\/supabase-js["']/.test(code) && /\bcreateClient\b/.test(code);
        return createsClient || /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/.test(code);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("no realtime subscriptions (they would need the browser to hold a Supabase key)", () => {
    const offenders = sourceFiles.filter((f) => /\.channel\(|postgres_changes|\.subscribe\(/.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});
