import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPassword, SCRYPT_PARAMS, verifyPassword } from "@/server/auth/password";

const PASSWORD = "Skladiste-Test-2026!";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hashPassword", () => {
  it("produces a self-describing scrypt hash with a random salt", async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);

    const [scheme, N, r, p, salt, key] = a.split("$");
    expect(scheme).toBe("scrypt");
    expect([Number(N), Number(r), Number(p)]).toEqual([SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p]);
    expect(Buffer.from(salt, "base64url")).toHaveLength(16);
    expect(Buffer.from(key, "base64url")).toHaveLength(32);
    expect(a).not.toBe(b); // per-user random salt
    expect(a).not.toContain(PASSWORD);
  });

  it("refuses an empty password", async () => {
    await expect(hashPassword("")).rejects.toThrow();
  });
});

describe("verifyPassword", () => {
  it("verifies a new hash and rejects a wrong password", async () => {
    const stored = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, stored)).toEqual({ ok: true, needsRehash: false });
    expect(await verifyPassword("wrong", stored)).toEqual({ ok: false, needsRehash: false });
    expect(await verifyPassword("", stored)).toEqual({ ok: false, needsRehash: false });
  });

  it("verifies a legacy SHA-256 hash and asks for a rehash", async () => {
    const legacy = crypto.createHash("sha256").update(PASSWORD).digest("hex");

    expect(await verifyPassword(PASSWORD, legacy)).toEqual({ ok: true, needsRehash: true });
    expect(await verifyPassword(PASSWORD, legacy.toUpperCase())).toEqual({ ok: true, needsRehash: true });
    expect(await verifyPassword("wrong", legacy)).toEqual({ ok: false, needsRehash: false });
  });

  it("asks for a rehash when the stored scrypt parameters are weaker than current", async () => {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(PASSWORD, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
    const weak = ["scrypt", 2 ** 14, 8, 1, salt.toString("base64url"), key.toString("base64url")].join("$");

    expect(await verifyPassword(PASSWORD, weak)).toEqual({ ok: true, needsRehash: true });
  });

  it("rejects malformed or out-of-bounds stored values without running scrypt", async () => {
    const scrypt = vi.spyOn(crypto, "scrypt");
    const salt = Buffer.alloc(16, 1).toString("base64url");
    const key = Buffer.alloc(32, 2).toString("base64url");
    const bad = [
      "",
      "not-a-hash",
      "scrypt$32768$8$3$" + salt, // missing key
      `scrypt$${2 ** 30}$8$1$${salt}$${key}`, // N too large (memory DoS)
      `scrypt$30000$8$1$${salt}$${key}`, // N not a power of two
      `scrypt$32768$999$1$${salt}$${key}`, // r out of bounds
      `scrypt$32768$8$999$${salt}$${key}`, // p out of bounds
      `scrypt$32768$8$3$${Buffer.alloc(4).toString("base64url")}$${key}`, // salt too short
      `scrypt$32768$8$3$${salt}$${key}$extra`,
      `bcrypt$10$${salt}`,
    ];

    for (const stored of bad) {
      expect(await verifyPassword(PASSWORD, stored)).toEqual({ ok: false, needsRehash: false });
    }
    expect(scrypt).not.toHaveBeenCalled();
  });

  it("compares with timingSafeEqual on equal-length buffers", async () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");
    const stored = await hashPassword(PASSWORD);
    const legacy = crypto.createHash("sha256").update(PASSWORD).digest("hex");

    await verifyPassword("wrong", stored);
    await verifyPassword("wrong", legacy);

    expect(spy).toHaveBeenCalledTimes(2);
    for (const [a, b] of spy.mock.calls as Array<[Buffer, Buffer]>) {
      expect(a.length).toBe(b.length);
    }
  });
});
