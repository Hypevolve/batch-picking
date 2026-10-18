import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../init";
import { supabaseAdmin } from "@/server/db/supabase-admin";

export const dashboardRouter = router({
  // Admin: Dashboard counters.
  stats: adminProcedure.query(async () => {
    const count = (table: string) => supabaseAdmin.from(table).select("id", { count: "exact", head: true });
    const [orders, batches, picked, packed] = await Promise.all([
      count("orders"),
      count("batches"),
      count("batches").eq("status", "picked"),
      count("batches").eq("status", "packed"),
    ]);
    for (const r of [orders, batches, picked, packed]) {
      if (r.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: r.error.message });
    }
    return {
      orders: orders.count ?? 0,
      batches: batches.count ?? 0,
      picked: picked.count ?? 0,
      packed: packed.count ?? 0,
    };
  }),

  // Admin: Dashboard activity feed. Only the user's name is joined, never other user columns.
  recentActivity: adminProcedure.query(async () => {
    const { data, error } = await supabaseAdmin
      .from("activity_logs")
      .select("id, user_id, entity_type, entity_id, action, details, created_at, users(name)")
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data ?? [];
  }),
});
