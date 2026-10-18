import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Records which URL and key the Supabase client is created with; no network.
const created = vi.hoisted(() => [] as Array<{ url: string; key: string }>);
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string) => {
    created.push({ url, key });
    return { from: () => ({}) };
  },
}));

const URL = "https://unit-test.supabase.co";
const PUBLISHABLE = "sb_publishable_unit_test_0123456789";
const SERVICE = "sb_secret_unit_test_0123456789";
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

/** A legacy Supabase JWT-style key with the given role (signature is irrelevant here). */
function legacyKey(role: string): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ iss: "supabase", role })}.signature`;
}

/** Fresh copy of the module (its one-time warning flag included), created under `env`. */
async function load(env: Record<string, string>) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  vi.resetModules();
  return import("@/server/db/supabase-admin");
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  created.length = 0;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("server Supabase client", () => {
  it("uses SUPABASE_SERVICE_ROLE_KEY and never the publishable key when the service key is set", async () => {
    const mod = await load({
      NEXT_PUBLIC_SUPABASE_URL: URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    });
    mod.createSupabaseServerClient();

    expect(created.length).toBeGreaterThanOrEqual(2); // the shared supabaseAdmin + the explicit call
    for (const c of created) expect(c).toEqual({ url: URL, key: SERVICE });
    expect(created.some((c) => c.key === PUBLISHABLE)).toBe(false);
    expect(mod.isServiceRoleConfigured()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("accepts a legacy service_role JWT", async () => {
    const mod = await load({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: legacyKey("anon"), SUPABASE_SERVICE_ROLE_KEY: legacyKey("service_role") });

    expect(created[0].key).toBe(legacyKey("service_role"));
    expect(mod.isServiceRoleConfigured()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to the publishable key with one clear warning when the service key is missing", async () => {
    const mod = await load({ NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE });
    mod.createSupabaseServerClient();
    mod.createSupabaseServerClient();

    for (const c of created) expect(c).toEqual({ url: URL, key: PUBLISHABLE });
    expect(mod.isServiceRoleConfigured()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY is not set");
    expect(message).toContain("docs/RLS-PRELAZAK.md");
    expect(message).not.toContain(PUBLISHABLE);
  });

  it.each([
    ["the publishable key itself", PUBLISHABLE],
    ["another sb_publishable_ key", "sb_publishable_other_0123456789"],
    ["a legacy anon JWT", legacyKey("anon")],
  ])("does not accept %s as the service role key", async (_label, value) => {
    const mod = await load({ NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, SUPABASE_SERVICE_ROLE_KEY: value });

    expect(mod.isServiceRoleConfigured()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("holds a public (publishable/anon) key");
    expect(String(warn.mock.calls[0][0])).not.toContain(value);
  });

  it("still builds without any Supabase variables (placeholder, as before)", async () => {
    const mod = await load({});

    expect(created[0].url).toBe("https://placeholder-project.supabase.co");
    expect(mod.isServiceRoleConfigured()).toBe(false);
  });

  it("is guarded by `import \"server-only\"`, so a Client Component cannot import it", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../src/server/db/supabase-admin.ts"), "utf8");
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });
});
