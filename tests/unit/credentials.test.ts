import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizeCredentials,
  type CredentialsStore,
  type StoredUser,
} from "@/server/auth/credentials";

// Builds a hash in the stored format independently of the code under test,
// so the format itself is pinned: scrypt$N$r$p$<salt b64url>$<hash b64url>.
function scryptHash(password: string, N = 32768, r = 8, p = 3): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, { N, r, p, maxmem: 256 * N * r });
  return ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

function sha256Hex(password: string): string {
  return crypto.createHash("sha256").update(password, "utf8").digest("hex");
}

function memoryStore(users: StoredUser[]) {
  const rows = users.map((u) => ({ ...u }));
  const replaced: Array<{ id: StoredUser["id"]; newHash: string; expectedOldHash: string }> = [];
  const store: CredentialsStore = {
    async findActiveUserByEmail(email) {
      const u = rows.find((r) => r.email === email);
      return u ? { ...u } : null;
    },
    async replacePasswordHash(id, newHash, expectedOldHash) {
      replaced.push({ id, newHash, expectedOldHash });
      const u = rows.find((r) => r.id === id && r.password_hash === expectedOldHash);
      if (u) u.password_hash = newHash;
    },
  };
  return { store, rows, replaced };
}

const PASSWORD = "Skladiste-Test-2026!";

function user(id: number, email: string, password_hash: string, role = "picker"): StoredUser {
  return { id, email, name: `User ${id}`, role, password_hash };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authorizeCredentials", () => {
  it("accepts a password stored as a salted scrypt hash", async () => {
    const { store, replaced } = memoryStore([user(1, "a@test.local", scryptHash(PASSWORD), "admin")]);

    const result = await authorizeCredentials({ email: "a@test.local", password: PASSWORD }, store);

    expect(result).toEqual({ id: "1", email: "a@test.local", name: "User 1", role: "admin" });
    expect(replaced).toHaveLength(0);
  });

  it("accepts a legacy SHA-256 hash and replaces it with scrypt on login", async () => {
    const legacy = sha256Hex(PASSWORD);
    const { store, rows, replaced } = memoryStore([user(2, "p@test.local", legacy)]);

    const first = await authorizeCredentials({ email: "p@test.local", password: PASSWORD }, store);

    expect(first?.id).toBe("2");
    expect(replaced).toHaveLength(1);
    expect(replaced[0].id).toBe(2);
    expect(replaced[0].expectedOldHash).toBe(legacy);
    expect(replaced[0].newHash).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(rows[0].password_hash).toBe(replaced[0].newHash);

    // The upgraded hash works on the next login and is not rewritten again.
    const second = await authorizeCredentials({ email: "p@test.local", password: PASSWORD }, store);
    expect(second?.id).toBe("2");
    expect(replaced).toHaveLength(1);
  });

  it("rejects a wrong password for scrypt and legacy hashes and writes nothing", async () => {
    const { store, replaced } = memoryStore([
      user(1, "a@test.local", scryptHash(PASSWORD)),
      user(2, "p@test.local", sha256Hex(PASSWORD)),
    ]);

    for (const email of ["a@test.local", "p@test.local"]) {
      expect(await authorizeCredentials({ email, password: "wrong-password" }, store)).toBeNull();
      expect(await authorizeCredentials({ email, password: PASSWORD + " " }, store)).toBeNull();
    }
    expect(replaced).toHaveLength(0);
  });

  it("rejects unknown users and empty input", async () => {
    const { store } = memoryStore([user(1, "a@test.local", scryptHash(PASSWORD))]);

    expect(await authorizeCredentials({ email: "nobody@test.local", password: PASSWORD }, store)).toBeNull();
    expect(await authorizeCredentials({ email: "a@test.local", password: "" }, store)).toBeNull();
    expect(await authorizeCredentials({ email: "", password: PASSWORD }, store)).toBeNull();
    expect(await authorizeCredentials(undefined, store)).toBeNull();
  });

  it("rejects a stored hash in an unknown or malformed format", async () => {
    const { store } = memoryStore([
      user(1, "plain@test.local", PASSWORD),
      user(2, "md5@test.local", crypto.createHash("md5").update(PASSWORD).digest("hex")),
      user(3, "broken@test.local", "scrypt$32768$8$3$onlysalt"),
      user(4, "empty@test.local", ""),
    ]);

    for (const email of ["plain@test.local", "md5@test.local", "broken@test.local", "empty@test.local"]) {
      expect(await authorizeCredentials({ email, password: PASSWORD }, store)).toBeNull();
    }
  });

  it("still logs the user in when the hash upgrade cannot be saved", async () => {
    const { store } = memoryStore([user(2, "p@test.local", sha256Hex(PASSWORD))]);
    store.replacePasswordHash = vi.fn().mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await authorizeCredentials({ email: "p@test.local", password: PASSWORD }, store);

    expect(result?.id).toBe("2");
    expect(store.replacePasswordHash).toHaveBeenCalledTimes(1);
  });

  it("compares hashes in constant time, for both formats", async () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");
    const { store } = memoryStore([
      user(1, "a@test.local", scryptHash(PASSWORD)),
      user(2, "p@test.local", sha256Hex(PASSWORD)),
    ]);

    for (const email of ["a@test.local", "p@test.local"]) {
      spy.mockClear();
      await authorizeCredentials({ email, password: "wrong-password" }, store);
      expect(spy).toHaveBeenCalledTimes(1);
      const [a, b] = spy.mock.calls[0] as [Buffer, Buffer];
      expect(a.length).toBe(b.length);
      expect(a.length).toBe(32);
    }
  });
});
