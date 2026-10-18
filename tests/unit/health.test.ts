import { afterEach, describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { GET } from "@/app/api/health/route";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const SERVICE_KEY = "sb_secret_test_service_role_key_0123456789";
const PUBLISHABLE_KEY = "sb_publishable_test_key_0123456789";

afterEach(() => {
  delete process.env.RENDER_GIT_COMMIT;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
});

describe("GET /api/health", () => {
  it("reports the app version and the deployed commit", async () => {
    process.env.RENDER_GIT_COMMIT = COMMIT;

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", version: pkg.version, commit: COMMIT, serviceRoleConfigured: false });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("reports commit null when not deployed on Render", async () => {
    const body = await (await GET()).json();

    expect(body).toEqual({ status: "ok", version: pkg.version, commit: null, serviceRoleConfigured: false });
  });

  it("only passes through something that looks like a git SHA", async () => {
    for (const value of ["not a sha", "abc", "0123456789abcdef0123456789abcdef01234567; rm", "postgres://user:pass@host/db"]) {
      process.env.RENDER_GIT_COMMIT = value;
      const body = await (await GET()).json();
      expect(body.commit).toBeNull();
    }
  });

  it("reports serviceRoleConfigured: true once SUPABASE_SERVICE_ROLE_KEY is set, without the key", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
    expect((await (await GET()).json()).serviceRoleConfigured).toBe(false);

    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    const res = await GET();
    const text = await res.text();

    expect(JSON.parse(text).serviceRoleConfigured).toBe(true);
    expect(text).not.toContain(SERVICE_KEY);
    expect(text).not.toContain(PUBLISHABLE_KEY);
  });

  it("does not count a publishable key pasted into SUPABASE_SERVICE_ROLE_KEY", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = PUBLISHABLE_KEY;

    expect((await (await GET()).json()).serviceRoleConfigured).toBe(false);
  });

  it("exposes nothing but status, version, commit and serviceRoleConfigured", async () => {
    process.env.RENDER_GIT_COMMIT = COMMIT;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    const body = await (await GET()).json();

    expect(Object.keys(body).sort()).toEqual(["commit", "serviceRoleConfigured", "status", "version"]);
    expect(typeof body.serviceRoleConfigured).toBe("boolean");
  });
});
