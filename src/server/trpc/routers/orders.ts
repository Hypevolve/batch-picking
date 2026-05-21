import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../init";
import { supabaseAdmin } from "@/server/db/supabase-admin";
import { syncOrders } from "@/server/services/woo-sync";

export const ordersRouter = router({
  list: protectedProcedure
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

  getById: protectedProcedure
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
});
