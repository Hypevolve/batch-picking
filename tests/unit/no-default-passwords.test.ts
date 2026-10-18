import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "public"]);
const TEXT_EXT = new Set([".md", ".ts", ".tsx", ".js", ".mjs", ".sql", ".json", ".yaml", ".yml", ".example", ".txt"]);

function textFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("._")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...textFiles(full));
    } else if (TEXT_EXT.has(path.extname(entry.name)) && entry.name !== "package-lock.json") {
      out.push(full);
    }
  }
  return out;
}

// The old seeded passwords, built at runtime so this file does not contain them.
const OLD_PASSWORDS = ["admin", "picker"].map((role) => `${role}${100 + 23}`);
const OLD_HASHES = OLD_PASSWORDS.map((p) => crypto.createHash("sha256").update(p).digest("hex"));

describe("no default passwords in the repository", () => {
  it("contains neither the old default passwords nor their hashes", () => {
    const hits: string[] = [];
    for (const file of textFiles(ROOT)) {
      const text = fs.readFileSync(file, "utf8");
      for (const needle of [...OLD_PASSWORDS, ...OLD_HASHES]) {
        if (text.includes(needle)) hits.push(`${path.relative(ROOT, file)}: ${needle.slice(0, 6)}…`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("README explains how the first admin gets a password", () => {
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    expect(readme).toContain("npm run user:hash-password");
    expect(readme).toMatch(/Korisnici/);
  });
});
