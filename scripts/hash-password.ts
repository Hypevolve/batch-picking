/**
 * Prints a scrypt password hash for the `users.password_hash` column.
 * Used once, to create the first administrator by hand (Supabase SQL editor);
 * every later user is created from the admin panel (Korisnici).
 *
 *   npm run user:hash-password            # asks for the password, input hidden
 *   printf '%s' "$PW" | npm run -s user:hash-password
 *
 * It does not connect to any database and never prints the password.
 */
import { hashPassword } from "../src/server/auth/password";

const MIN_LENGTH = 8;

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          return reject(new Error("cancelled"));
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPiped(): Promise<string> {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

async function main() {
  let password: string;
  if (process.stdin.isTTY) {
    password = await readHidden("Lozinka: ");
    const again = await readHidden("Ponovi lozinku: ");
    if (password !== again) throw new Error("Lozinke se ne podudaraju");
  } else {
    password = await readPiped();
  }
  if (password.length < MIN_LENGTH) throw new Error(`Lozinka mora imati barem ${MIN_LENGTH} znakova`);
  process.stdout.write((await hashPassword(password)) + "\n");
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
