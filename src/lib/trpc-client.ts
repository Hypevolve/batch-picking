import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/server/trpc/router";

/**
 * Typed tRPC client for event handlers and effects in Client Components.
 * The browser reads and writes data only through /api/trpc; it has no
 * Supabase client and no Supabase key.
 */
export const api = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc" })],
});

/** Readable message from a tRPC error (zod validation errors arrive as a JSON list of issues). */
export function apiErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (!message) return "Nepoznata greška";
  try {
    const issues = JSON.parse(message);
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  } catch {
    // not a validation error list
  }
  return message;
}
