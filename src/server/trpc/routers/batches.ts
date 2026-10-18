import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../init";
import { supabaseAdmin } from "@/server/db/supabase-admin";
import { generateBatches } from "@/server/services/batch-engine";
import { transitionBatchStatus } from "@/server/services/status-machine";

const batchStatus = z.enum(["draft", "ready", "in_progress", "picked", "packed", "synced"]);

/** The only transitions the picker screens make: start picking, finish picking. */
const PICKER_STATUSES: ReadonlyArray<z.infer<typeof batchStatus>> = ["in_progress", "picked"];

/** Batch columns the picker screens show. */
const PICKER_BATCH_COLUMNS = "id, batch_code, batch_type, status, order_count, total_items, total_quantity";

function fail(error: { message: string } | null): void {
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

export const batchesRouter = router({
  // Admin: Batchevi.
  list: adminProcedure
    .input(z.object({ status: batchStatus.optional() }).optional())
    .query(async ({ input }) => {
      let query = supabaseAdmin
        .from("batches")
        .select("*")
        .order("generated_at", { ascending: false });

      if (input?.status) {
        query = query.eq("status", input.status);
      }

      const { data, error } = await query;
      fail(error);
      return data ?? [];
    }),

  // Admin: batch detail with the customer of each basket.
  getById: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const { data: batch } = await supabaseAdmin
        .from("batches")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();

      if (!batch) return null;

      const { data: batchOrdersList, error: ordersError } = await supabaseAdmin
        .from("batch_orders")
        .select("id, basket_label, order_id, orders(customer_name, woo_order_id)")
        .eq("batch_id", input.id);
      fail(ordersError);

      const { data: items, error: itemsError } = await supabaseAdmin
        .from("batch_items")
        .select("*")
        .eq("batch_id", input.id)
        .order("route_position", { ascending: true });
      fail(itemsError);

      return { ...batch, orders: batchOrdersList || [], items: items || [] };
    }),

  // Picker home: counters and the batches that can be picked.
  pickerOverview: protectedProcedure.query(async () => {
    const count = () => supabaseAdmin.from("batches").select("id", { count: "exact", head: true });
    const [ready, inProgress, done, list] = await Promise.all([
      count().eq("status", "ready"),
      count().eq("status", "in_progress"),
      count().in("status", ["picked", "packed", "synced"]),
      supabaseAdmin
        .from("batches")
        .select(PICKER_BATCH_COLUMNS)
        .in("status", ["ready", "in_progress"])
        .order("generated_at", { ascending: false }),
    ]);
    for (const r of [ready, inProgress, done, list]) fail(r.error);

    return {
      counts: { ready: ready.count ?? 0, in_progress: inProgress.count ?? 0, done: done.count ?? 0 },
      batches: list.data ?? [],
    };
  }),

  // Picker: one batch and its pick list. No customer data.
  pickerView: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const { data: batch, error } = await supabaseAdmin
        .from("batches")
        .select(PICKER_BATCH_COLUMNS)
        .eq("id", input.id)
        .maybeSingle();
      fail(error);
      if (!batch) return null;

      const { data: items, error: itemsError } = await supabaseAdmin
        .from("batch_items")
        .select("*")
        .eq("batch_id", input.id)
        .order("route_position", { ascending: true });
      fail(itemsError);

      return { batch, items: items ?? [] };
    }),

  generate: adminProcedure.mutation(async () => {
    return generateBatches();
  }),

  // Pickers may only start and finish picking; every other transition is the admin's.
  updateStatus: protectedProcedure
    .input(z.object({ batchId: z.number().int(), status: batchStatus }))
    .mutation(async ({ input, ctx }) => {
      const role = (ctx.session.user as { role?: string }).role;
      if (role !== "admin" && !PICKER_STATUSES.includes(input.status)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      const userId = Number((ctx.session.user as { id?: string }).id);
      return transitionBatchStatus(input.batchId, input.status, userId);
    }),

  markItemPicked: protectedProcedure
    .input(z.object({ itemId: z.number().int(), picked: z.boolean() }))
    .mutation(async ({ input }) => {
      const { error } = await supabaseAdmin
        .from("batch_items")
        .update({ is_picked: input.picked })
        .eq("id", input.itemId);

      fail(error);
      return { success: true };
    }),
});
