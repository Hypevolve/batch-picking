import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

// All database access goes to an in-memory double; nothing leaves the process.
const db = vi.hoisted(() => ({ tables: { users: [] as Array<Record<string, unknown>> } }));
vi.mock("@/server/db/supabase-admin", async () => {
  const { fakeSupabase } = await import("../helpers/fake-supabase");
  return { supabaseAdmin: fakeSupabase(db.tables) };
});

import { usersRouter } from "@/server/trpc/routers/users";
import { usersRepo } from "@/server/db/users-repo";
import { authorizeCredentials } from "@/server/auth/credentials";
import { verifyPassword } from "@/server/auth/password";

const PASSWORD = "Skladiste-Test-2026!";

function session(role: "admin" | "picker"): Session {
  return { user: { id: "1", role, email: `${role}@test.local`, name: role }, expires: "2999-01-01T00:00:00.000Z" };
}
const asAdmin = () => usersRouter.createCaller({ session: session("admin") });
const login = (email: string, password: string) =>
  authorizeCredentials({ email, password }, usersRepo.credentialsStore);
const row = (email: string) => db.tables.users.find((u) => u.email === email)!;

beforeEach(() => {
  db.tables.users.length = 0;
});

describe("users router", () => {
  it("creates a user with a scrypt hash computed on the server", async () => {
    const { id } = await asAdmin().create({ email: "new@test.local", name: "New", role: "picker", password: PASSWORD });

    const stored = row("new@test.local").password_hash as string;
    expect(id).toBeTypeOf("number");
    expect(stored).toMatch(/^scrypt\$/);
    expect(stored).not.toBe(crypto.createHash("sha256").update(PASSWORD).digest("hex"));
    expect((await verifyPassword(PASSWORD, stored)).ok).toBe(true);
    expect((await login("new@test.local", PASSWORD))?.role).toBe("picker");
  });

  it("never returns password hashes from list", async () => {
    await asAdmin().create({ email: "new@test.local", name: "New", role: "admin", password: PASSWORD });

    const users = await asAdmin().list();

    expect(users).toHaveLength(1);
    expect(users[0]).not.toHaveProperty("password_hash");
    expect(JSON.stringify(users)).not.toContain("scrypt$");
  });

  it("changes the password only when a new one is given", async () => {
    const caller = asAdmin();
    const { id } = await caller.create({ email: "u@test.local", name: "U", role: "picker", password: PASSWORD });
    const before = row("u@test.local").password_hash;

    await caller.update({ id, name: "U2", role: "admin", password: "" });
    expect(row("u@test.local").password_hash).toBe(before);
    expect(row("u@test.local")).toMatchObject({ name: "U2", role: "admin" });

    await caller.update({ id, name: "U2", role: "admin", password: "Nova-Lozinka-99" });
    expect(row("u@test.local").password_hash).not.toBe(before);
    expect(await login("u@test.local", PASSWORD)).toBeNull();
    expect((await login("u@test.local", "Nova-Lozinka-99"))?.id).toBe(String(id));
  });

  it("rejects short passwords and duplicate e-mails", async () => {
    const caller = asAdmin();
    await expect(caller.create({ email: "s@test.local", name: "S", role: "picker", password: "short" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await caller.create({ email: "d@test.local", name: "D", role: "picker", password: PASSWORD });
    await expect(caller.create({ email: "d@test.local", name: "D", role: "picker", password: PASSWORD })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deactivated users cannot log in", async () => {
    const caller = asAdmin();
    const { id } = await caller.create({ email: "x@test.local", name: "X", role: "picker", password: PASSWORD });

    await caller.setActive({ id, active: false });

    expect(await login("x@test.local", PASSWORD)).toBeNull();
  });

  it("is admin-only", async () => {
    const picker = usersRouter.createCaller({ session: session("picker") });
    const anon = usersRouter.createCaller({ session: null });
    const input = { email: "p@test.local", name: "P", role: "admin" as const, password: PASSWORD };

    await expect(picker.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(picker.create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(anon.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anon.setActive({ id: 1, active: false })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.tables.users).toHaveLength(0);
  });
});

describe("Supabase credentials store", () => {
  it("upgrades a legacy SHA-256 row in the database on login", async () => {
    const legacy = crypto.createHash("sha256").update(PASSWORD).digest("hex");
    db.tables.users.push({ id: 7, email: "old@test.local", name: "Old", role: "admin", active: true, password_hash: legacy });

    const user = await login("old@test.local", PASSWORD);

    expect(user).toMatchObject({ id: "7", role: "admin" });
    const upgraded = row("old@test.local").password_hash as string;
    expect(upgraded).toMatch(/^scrypt\$32768\$8\$3\$/);
    expect(await verifyPassword(PASSWORD, upgraded)).toEqual({ ok: true, needsRehash: false });
  });

  it("does not overwrite a hash that changed since it was read", async () => {
    db.tables.users.push({ id: 8, email: "c@test.local", name: "C", role: "picker", active: true, password_hash: "scrypt$changed" });

    await usersRepo.credentialsStore.replacePasswordHash(8, "scrypt$new", "stale-legacy-hash");

    expect(row("c@test.local").password_hash).toBe("scrypt$changed");
  });
});
