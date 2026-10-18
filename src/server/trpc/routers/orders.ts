import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../init";
import { supabaseAdmin } from "@/server/db/supabase-admin";
import { syncOrders } from "@/server/services/woo-sync";

/** Columns the Narudžbe table shows. */
const ORDER_LIST_COLUMNS = "id, woo_order_id, customer_name, status, woo_status, synced_at";

// Orders hold customer data: every procedure here is admin-only.
export const ordersRouter = router({
  // Admin: Narudžbe, one page at a time, newest sync first.
  page: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1).max(100),
      })
    )
    .query(async ({ input }) => {
      const start = (input.page - 1) * input.pageSize;
      const { data, count, error } = await supabaseAdmin
        .from("orders")
        .select(ORDER_LIST_COLUMNS, { count: "exact" })
        .order("synced_at", { ascending: false })
        .range(start, start + input.pageSize - 1);
      // Page past the end (orders were deleted meanwhile): empty page, the screen goes back to page 1.
      if (error?.code === "PGRST103") return { orders: [], total: 0 };
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { orders: data ?? [], total: count ?? 0 };
    }),

  list: adminProcedure
    .input(
      z
        .object({
          status: z
            .enum(["pending_batch", "batched", "picked", "packed", "synced"])
            .optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      let query = supabaseAdmin
        .from("orders")
        .select("*")
        .order("synced_at", { ascending: false });

      if (input?.status) {
        query = query.eq("status", input.status);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }),

  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("*")
        .eq("id", input.id)
        .single();

      if (!order) return null;

      const { data: items } = await supabaseAdmin
        .from("order_items")
        .select("*")
        .eq("order_id", input.id);

      return { ...order, items: items || [] };
    }),

  sync: adminProcedure.mutation(async () => {
    return syncOrders();
  }),

  resetAndSync: adminProcedure.mutation(async () => {
    const cleanupErrors: string[] = [];

    try {
      const { error } = await supabaseAdmin.from("batch_items").delete().neq("id", 0);
      if (error) cleanupErrors.push(`batch_items: ${error.message}`);
    } catch (e) {
      cleanupErrors.push(String(e));
    }

    try {
      const { error } = await supabaseAdmin.from("batch_orders").delete().neq("id", 0);
      if (error) cleanupErrors.push(`batch_orders: ${error.message}`);
    } catch (e) {
      cleanupErrors.push(String(e));
    }

    try {
      const { error } = await supabaseAdmin.from("batches").delete().neq("id", 0);
      if (error) cleanupErrors.push(`batches: ${error.message}`);
    } catch (e) {
      cleanupErrors.push(String(e));
    }

    try {
      const { error } = await supabaseAdmin.from("order_items").delete().neq("id", 0);
      if (error) cleanupErrors.push(`order_items: ${error.message}`);
    } catch (e) {
      cleanupErrors.push(String(e));
    }

    try {
      const { error } = await supabaseAdmin.from("orders").delete().neq("id", 0);
      if (error) cleanupErrors.push(`orders: ${error.message}`);
    } catch (e) {
      cleanupErrors.push(String(e));
    }

    const syncResult = await syncOrders();

    return {
      cleaned: cleanupErrors.length === 0,
      cleanupErrors,
      ...syncResult,
    };
  }),
});
