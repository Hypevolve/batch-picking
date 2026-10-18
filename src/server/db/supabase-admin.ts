import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The only Supabase client in the app. Server-only: `import "server-only"` makes
 * the build fail if a Client Component imports this file, and the service key is
 * read from SUPABASE_SERVICE_ROLE_KEY, which (unlike NEXT_PUBLIC_*) Next.js never
 * inlines into browser bundles.
 *
 * The service role bypasses row level security; the tables grant nothing to the
 * `anon` and `authenticated` roles (supabase/migrations/0003_lock_rls.sql), so
 * every read and write goes through tRPC or a route handler on this server.
 *
 * Transition fallback: while SUPABASE_SERVICE_ROLE_KEY is not set, the client
 * uses the publishable key as before and logs one warning, so the live app keeps
 * working if this code is deployed before the variable is set. Once the RLS
 * migration has run, the publishable key can no longer read anything.
 */

type Env = Record<string, string | undefined>;

const PLACEHOLDER_URL = "https://placeholder-project.supabase.co";
const PLACEHOLDER_KEY = "placeholder-anon-key";

export interface SupabaseServerCredentials {
  url: string;
  key: string;
  serviceRoleConfigured: boolean;
  /** Set when the client runs on the publishable-key fallback. Never contains a key. */
  warning: string | null;
}

/** True for a key the browser may hold: new `sb_publishable_…` keys and legacy JWTs with role `anon`. */
function isPublicKey(key: string, publishableKey: string | undefined): boolean {
  if (key === publishableKey || key.startsWith("sb_publishable_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload?.role === "anon";
  } catch {
    return false;
  }
}

export function resolveSupabaseServerCredentials(env: Env = process.env): SupabaseServerCredentials {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() || PLACEHOLDER_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || undefined;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;

  if (serviceKey && !isPublicKey(serviceKey, publishableKey)) {
    return { url, key: serviceKey, serviceRoleConfigured: true, warning: null };
  }

  const reason = serviceKey
    ? "SUPABASE_SERVICE_ROLE_KEY holds a public (publishable/anon) key, not the service role key"
    : "SUPABASE_SERVICE_ROLE_KEY is not set";
  return {
    url,
    key: publishableKey || PLACEHOLDER_KEY,
    serviceRoleConfigured: false,
    warning:
      `[supabase] ${reason}; falling back to NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ` +
      "Set SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API Keys → secret / service_role) " +
      "before running supabase/migrations/0003_lock_rls.sql, or the app will lose database access. " +
      "See docs/RLS-PRELAZAK.md.",
  };
}

/** Exposed by /api/health so the deploy order can be checked from outside. */
export function isServiceRoleConfigured(env: Env = process.env): boolean {
  return resolveSupabaseServerCredentials(env).serviceRoleConfigured;
}

let warned = false;

export function createSupabaseServerClient(
  env: Env = process.env,
  warn: (message: string) => void = console.warn
): SupabaseClient {
  const { url, key, warning } = resolveSupabaseServerCredentials(env);
  if (warning && !warned) {
    warned = true;
    warn(warning);
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export const supabaseAdmin = createSupabaseServerClient();
