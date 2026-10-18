import crypto from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt (no native dependency).
 *
 * Stored format (self-describing, so parameters can be raised later):
 *   scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
 *
 * Legacy format: 64 hex characters = unsalted SHA-256 of the password.
 * Legacy hashes still verify, and `needsRehash` tells the caller to replace them.
 */

// OWASP minimum-equivalent setting for scrypt: N=2^15, r=8, p=3 (32 MiB, ~130 ms).
export const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

// Bounds for parameters read back from the database, so a malformed row
// cannot make a login request burn unbounded CPU or memory.
const MIN_LOG2_N = 14;
const MAX_LOG2_N = 20;
const MAX_R = 16;
const MAX_P = 16;

const LEGACY_SHA256 = /^[0-9a-f]{64}$/i;

export interface VerifyResult {
  ok: boolean;
  /** True when the password is correct but the stored hash is legacy or uses weaker parameters. */
  needsRehash: boolean;
}

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  params: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFC"),
      salt,
      keylen,
      { ...params, maxmem: 256 * params.N * params.r },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password must be a non-empty string");
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

interface ParsedScrypt {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parseScrypt(stored: string): ParsedScrypt | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, nStr, rStr, pStr, saltStr, keyStr] = parts;
  if (![nStr, rStr, pStr].every((s) => /^[0-9]{1,8}$/.test(s))) return null;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  const log2N = Math.log2(N);
  if (!Number.isInteger(log2N) || log2N < MIN_LOG2_N || log2N > MAX_LOG2_N) return null;
  if (r < 1 || r > MAX_R || p < 1 || p > MAX_P) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(saltStr) || !/^[A-Za-z0-9_-]+$/.test(keyStr)) return null;
  const salt = Buffer.from(saltStr, "base64url");
  const key = Buffer.from(keyStr, "base64url");
  if (salt.length < SALT_BYTES || key.length < 16 || key.length > 64) return null;
  return { N, r, p, salt, key };
}

function isWeakerThanCurrent({ N, r, p, key }: ParsedScrypt): boolean {
  return (
    N < SCRYPT_PARAMS.N || r < SCRYPT_PARAMS.r || p < SCRYPT_PARAMS.p || key.length < KEY_BYTES
  );
}

/** Verifies a password against a stored hash in the scrypt or legacy SHA-256 format. */
export async function verifyPassword(password: string, stored: string): Promise<VerifyResult> {
  const fail: VerifyResult = { ok: false, needsRehash: false };
  if (typeof password !== "string" || password.length === 0) return fail;
  if (typeof stored !== "string" || stored.length === 0) return fail;

  if (stored.startsWith("scrypt$")) {
    const parsed = parseScrypt(stored);
    if (!parsed) return fail;
    const candidate = await scryptAsync(password, parsed.salt, parsed.key.length, parsed);
    const ok = crypto.timingSafeEqual(candidate, parsed.key);
    return { ok, needsRehash: ok && isWeakerThanCurrent(parsed) };
  }

  if (LEGACY_SHA256.test(stored)) {
    // Legacy rows were hashed without NFC normalisation; hash the raw input.
    const candidate = crypto.createHash("sha256").update(password, "utf8").digest();
    const ok = crypto.timingSafeEqual(candidate, Buffer.from(stored, "hex"));
    return { ok, needsRehash: ok };
  }

  return fail;
}

// A real scrypt hash of a random value, used to spend the same time on
// unknown e-mail addresses as on known ones.
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomBytes(18).toString("base64url"));
  return dummyHash;
}
