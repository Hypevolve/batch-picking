import { dummyPasswordHash, hashPassword, verifyPassword } from "./password";

export interface StoredUser {
  id: number | string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
}

export interface CredentialsStore {
  findActiveUserByEmail(email: string): Promise<StoredUser | null>;
  /** Replaces the hash only if it still equals `expectedOldHash` (no lost update on a concurrent password change). */
  replacePasswordHash(id: StoredUser["id"], newHash: string, expectedOldHash: string): Promise<void>;
}

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "picker";
}

/**
 * Credentials login: verifies the password and, when the stored hash is the
 * legacy unsalted SHA-256 (or uses weaker scrypt parameters), replaces it with
 * a fresh scrypt hash. A failed upgrade never blocks the login.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>> | undefined,
  store: CredentialsStore
): Promise<AuthorizedUser | null> {
  const email = credentials?.email;
  const password = credentials?.password;
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return null;
  }

  const user = await store.findActiveUserByEmail(email);
  if (!user) {
    // Same cost as a real check, so response time does not reveal which e-mails exist.
    await verifyPassword(password, await dummyPasswordHash());
    return null;
  }

  const { ok, needsRehash } = await verifyPassword(password, user.password_hash);
  if (!ok) return null;

  if (needsRehash) {
    try {
      await store.replacePasswordHash(user.id, await hashPassword(password), user.password_hash);
    } catch (err) {
      console.error(
        "Password hash upgrade failed for user",
        user.id,
        err instanceof Error ? err.message : "unknown error"
      );
    }
  }

  // Anything other than "admin" was already treated as a picker by the route guards.
  const role = user.role === "admin" ? "admin" : "picker";
  return { id: String(user.id), email: user.email, name: user.name, role };
}
