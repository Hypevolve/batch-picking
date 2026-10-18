import { afterEach, describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { GET } from "@/app/api/health/route";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

afterEach(() => {
  delete process.env.RENDER_GIT_COMMIT;
});

describe("GET /api/health", () => {
  it("reports the app version and the deployed commit", async () => {
    process.env.RENDER_GIT_COMMIT = COMMIT;

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", version: pkg.version, commit: COMMIT });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("reports commit null when not deployed on Render", async () => {
    const body = await (await GET()).json();

    expect(body).toEqual({ status: "ok", version: pkg.version, commit: null });
  });

  it("only passes through something that looks like a git SHA", async () => {
    for (const value of ["not a sha", "abc", "0123456789abcdef0123456789abcdef01234567; rm", "postgres://user:pass@host/db"]) {
      process.env.RENDER_GIT_COMMIT = value;
      const body = await (await GET()).json();
      expect(body.commit).toBeNull();
    }
  });

  it("exposes nothing but status, version and commit", async () => {
    process.env.RENDER_GIT_COMMIT = COMMIT;
    const body = await (await GET()).json();

    expect(Object.keys(body).sort()).toEqual(["commit", "status", "version"]);
  });
});
