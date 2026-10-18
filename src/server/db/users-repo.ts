import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase-admin";
import type { CredentialsStore, StoredUser } from "@/server/auth/credentials";

/** Columns that may leave the server. `password_hash` is never in this list. */
export const PUBLIC_USER_COLUMNS = "id, email, name, role, active, created_at";

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: string;
  active: boolean;
  created_at: string;
}

export function createUsersRepo(db: SupabaseClient) {
  const credentialsStore: CredentialsStore = {
    async findActiveUserByEmail(email) {
      const { data, error } = await db
        .from("users")
        .select("id, email, name, role, password_hash")
        .eq("email", email)
        .eq("active", true)
        .limit(1);
      if (error || !data || data.length === 0) return null;
      return data[0] as StoredUser;
    },

    async replacePasswordHash(id, newHash, expectedOldHash) {
      const { error } = await db
        .from("users")
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("password_hash", expectedOldHash);
      if (error) throw new Error(error.message);
    },
  };

  return {
    credentialsStore,

    async list(): Promise<PublicUser[]> {
      const { data, error } = await db
        .from("users")
        .select(PUBLIC_USER_COLUMNS)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as PublicUser[];
    },

    async create(input: { email: string; name: string; role: string; passwordHash: string }) {
      const { data, error } = await db
        .from("users")
        .insert({
          email: input.email,
          name: input.name,
          role: input.role,
          password_hash: input.passwordHash,
          active: true,
        })
        .select("id")
        .single();
      if (error) return { error: { code: error.code, message: error.message } };
      return { id: (data as { id: number }).id };
    },

    async update(id: number, fields: { name: string; role: string; passwordHash?: string }) {
      const update: Record<string, unknown> = {
        name: fields.name,
        role: fields.role,
        updated_at: new Date().toISOString(),
      };
      if (fields.passwordHash) update.password_hash = fields.passwordHash;
      const { error } = await db.from("users").update(update).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async setActive(id: number, active: boolean) {
      const { error } = await db
        .from("users")
        .update({ active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

export const usersRepo = createUsersRepo(supabaseAdmin);
