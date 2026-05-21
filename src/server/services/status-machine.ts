import { supabaseAdmin } from "@/server/db/supabase-admin";
import { updateOrderStatus } from "@/lib/woocommerce";

type BatchStatus = "draft" | "ready" | "in_progress" | "picked" | "packed" | "synced";

const ALLOWED_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  draft: ["ready"],
  ready: ["in_progress"],
  in_progress: ["picked"],
  picked: ["packed"],
  packed: ["synced"],
  synced: [],
};

/**
 * Transition a batch to a new status with validation
 */
export async function transitionBatchStatus(
  batchId: number,
  newStatus: BatchStatus,
  userId?: number
): Promise<{ success: boolean; error?: string }> {
  const { data: batch } = await supabaseAdmin
    .from("batches")
    .select("*")
    .eq("id", batchId)
    .single();

  if (!batch) {
    return { success: false, error: "Batch not found" };
  }

  const currentStatus = batch.status as BatchStatus;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];

  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
    };
  }

  // Apply status-specific side effects
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "in_progress") {
    updateData.started_at = new Date().toISOString();
  } else if (newStatus === "picked" || newStatus === "packed") {
    updateData.completed_at = new Date().toISOString();
  }

  await supabaseAdmin
    .from("batches")
    .update(updateData)
    .eq("id", batchId);

  // Update order statuses based on batch status
  if (newStatus === "picked" || newStatus === "packed") {
    const { data: batchOrderRecords } = await supabaseAdmin
      .from("batch_orders")
      .select("order_id")
      .eq("batch_id", batchId);

    const orderStatus = newStatus === "picked" ? "picked" : "packed";
    for (const bo of batchOrderRecords || []) {
      await supabaseAdmin
        .from("orders")
        .update({ status: orderStatus, updated_at: new Date().toISOString() })
        .eq("id", bo.order_id);
    }
  }

  // Log activity
  await supabaseAdmin.from("activity_logs").insert({
    user_id: userId || null,
    entity_type: "batch",
    entity_id: batchId,
    action: "status_changed",
    details: { from: currentStatus, to: newStatus },
  });

  return { success: true };
}

/**
 * Sync completed batch orders back to WooCommerce
 */
export async function syncBatchToWoo(
  batchId: number,
  targetWooStatus = "completed"
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  const { data: batchOrderRecords } = await supabaseAdmin
    .from("batch_orders")
    .select("order_id")
    .eq("batch_id", batchId);

  for (const bo of batchOrderRecords || []) {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", bo.order_id)
      .single();

    if (!order) continue;

    try {
      await updateOrderStatus(order.woo_order_id, targetWooStatus);
      await supabaseAdmin
        .from("orders")
        .update({ status: "synced", updated_at: new Date().toISOString() })
        .eq("id", order.id);
    } catch (error) {
      errors.push(
        `Order #${order.woo_order_id}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  if (errors.length === 0) {
    await transitionBatchStatus(batchId, "synced");
  }

  return { success: errors.length === 0, errors };
}
