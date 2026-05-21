import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../init";
import { supabaseAdmin } from "@/server/db/supabase-admin";
import { generateBatches } from "@/server/services/batch-engine";
import { transitionBatchStatus } from "@/server/services/status-machine";

export const batchesRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["draft", "ready", "in_progress", "picked", "packed", "synced"])
            .optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      let query = supabaseAdmin
        .from("batches")
        .select("*")
        .order("generated_at", { ascending: false });

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
      const { data: batch } = await supabaseAdmin
        .from("batches")
        .select("*")
        .eq("id", input.id)
        .single();

      if (!batch) return null;

      const { data: batchOrdersList } = await supabaseAdmin
        .from("batch_orders")
        .select("basket_label, order_id, orders(customer_name, woo_order_id)")
        .eq("batch_id", input.id);

      const { data: items } = await supabaseAdmin
        .from("batch_items")
        .select("*")
        .eq("batch_id", input.id)
        .order("route_position", { ascending: true });

      return { ...batch, orders: batchOrdersList || [], items: items || [] };
    }),

  generate: adminProcedure.mutation(async () => {
    return generateBatches();
  }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        batchId: z.number(),
        status: z.enum([
          "draft",
          "ready",
          "in_progress",
          "picked",
          "packed",
          "synced",
        ]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = Number((ctx.session.user as { id?: string }).id);
      return transitionBatchStatus(input.batchId, input.status, userId);
    }),

  markItemPicked: protectedProcedure
    .input(z.object({ itemId: z.number(), picked: z.boolean() }))
    .mutation(async ({ input }) => {
      const { error } = await supabaseAdmin
        .from("batch_items")
        .update({ is_picked: input.picked })
        .eq("id", input.itemId);

      if (error) throw new Error(error.message);
      return { success: true };
    }),
});
