import { supabaseAdmin } from "@/server/db/supabase-admin";
import { generateBatchCode } from "@/lib/utils";

const BATCH_SIZE = 5;
const SMART_THRESHOLD = 0.1; // 10% overlap for "smart" classification

interface OrderWithItems {
  orderId: number;
  skus: string[];
}

/**
 * Calculate Jaccard similarity between two sets of SKUs
 */
export function calculateJaccardSimilarity(
  skusA: string[],
  skusB: string[]
): number {
  const setA = new Set(skusA);
  const setB = new Set(skusB);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Build a pairwise similarity matrix for all orders
 */
export function buildSimilarityMatrix(
  ordersWithItems: OrderWithItems[]
): Map<string, number> {
  const matrix = new Map<string, number>();

  for (let i = 0; i < ordersWithItems.length; i++) {
    for (let j = i + 1; j < ordersWithItems.length; j++) {
      const similarity = calculateJaccardSimilarity(
        ordersWithItems[i].skus,
        ordersWithItems[j].skus
      );
      const key = `${ordersWithItems[i].orderId}-${ordersWithItems[j].orderId}`;
      matrix.set(key, similarity);
    }
  }

  return matrix;
}

/**
 * Greedy grouping algorithm: group orders by highest mutual similarity
 */
export function greedyGroupOrders(
  ordersWithItems: OrderWithItems[],
  batchSize: number = BATCH_SIZE
): OrderWithItems[][] {
  const groups: OrderWithItems[][] = [];
  const assigned = new Set<number>();
  const matrix = buildSimilarityMatrix(ordersWithItems);

  // Sort pairs by similarity descending
  const sortedPairs = [...matrix.entries()].sort((a, b) => b[1] - a[1]);

  while (assigned.size < ordersWithItems.length) {
    const currentGroup: OrderWithItems[] = [];

    // Find the best unassigned seed pair
    let seedFound = false;
    for (const [key] of sortedPairs) {
      const [idA, idB] = key.split("-").map(Number);
      if (!assigned.has(idA) && !assigned.has(idB)) {
        const orderA = ordersWithItems.find((o) => o.orderId === idA)!;
        const orderB = ordersWithItems.find((o) => o.orderId === idB)!;
        currentGroup.push(orderA, orderB);
        assigned.add(idA);
        assigned.add(idB);
        seedFound = true;
        break;
      }
    }

    // If no pair found, pick first unassigned
    if (!seedFound) {
      const remaining = ordersWithItems.find((o) => !assigned.has(o.orderId));
      if (remaining) {
        currentGroup.push(remaining);
        assigned.add(remaining.orderId);
      } else {
        break;
      }
    }

    // Fill group up to batchSize with most similar remaining orders
    while (currentGroup.length < batchSize) {
      let bestCandidate: OrderWithItems | null = null;
      let bestScore = -1;

      for (const order of ordersWithItems) {
        if (assigned.has(order.orderId)) continue;

        // Average similarity to current group members
        let totalSim = 0;
        for (const member of currentGroup) {
          const keyA = `${Math.min(order.orderId, member.orderId)}-${Math.max(order.orderId, member.orderId)}`;
          totalSim += matrix.get(keyA) || 0;
        }
        const avgSim = totalSim / currentGroup.length;

        if (avgSim > bestScore) {
          bestScore = avgSim;
          bestCandidate = order;
        }
      }

      if (bestCandidate) {
        currentGroup.push(bestCandidate);
        assigned.add(bestCandidate.orderId);
      } else {
        break; // No more unassigned orders
      }
    }

    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Classify batch type based on average similarity
 */
export function classifyBatchType(
  group: OrderWithItems[]
): { type: "smart" | "mixed" | "partial"; score: number } {
  if (group.length < BATCH_SIZE) {
    return { type: "partial", score: 0 };
  }

  const matrix = buildSimilarityMatrix(group);
  const scores = [...matrix.values()];
  const avgScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    type: avgScore >= SMART_THRESHOLD ? "smart" : "mixed",
    score: Math.round(avgScore * 100) / 100,
  };
}

const BASKET_LABELS = ["A", "B", "C", "D", "E"] as const;

/**
 * Generate batches from unbatched orders
 */
export async function generateBatches(): Promise<{
  created: number;
  errors: string[];
}> {
  const errors: string[] = [];

  // Fetch all unbatched orders with their items
  const { data: unbatchedOrders, error: ordersError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("status", "pending_batch");

  if (ordersError) throw new Error(ordersError.message);
  if (!unbatchedOrders || unbatchedOrders.length === 0) {
    return { created: 0, errors: ["No unbatched orders available"] };
  }

  // Get order items for all unbatched orders
  const orderIds = unbatchedOrders.map((o: { id: number }) => o.id);
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);

  if (!items) return { created: 0, errors: ["Failed to fetch order items"] };

  // Build orders with SKUs
  const ordersWithItems: OrderWithItems[] = unbatchedOrders.map(
    (order: { id: number }) => ({
      orderId: order.id,
      skus: items
        .filter((item: { order_id: number }) => item.order_id === order.id)
        .map((item: { sku: string }) => item.sku),
    })
  );

  // Group orders
  const groups = greedyGroupOrders(ordersWithItems);
  let created = 0;

  for (const group of groups) {
    try {
      const { type, score } = classifyBatchType(group);
      const batchCode = generateBatchCode();

      // Calculate total items and quantity
      const groupOrderIds = group.map((g) => g.orderId);
      const groupItems = items.filter(
        (i: { order_id: number }) => groupOrderIds.includes(i.order_id)
      );
      const totalQuantity = groupItems.reduce(
        (sum: number, i: { quantity: number }) => sum + i.quantity,
        0
      );

      // Consolidate SKUs across all orders in batch
      const skuMap = new Map<
        string,
        { totalQty: number; breakdown: Record<string, number> }
      >();

      for (let i = 0; i < group.length; i++) {
        const basketLabel = BASKET_LABELS[i];
        const orderItemsForOrder = groupItems.filter(
          (item: { order_id: number }) => item.order_id === group[i].orderId
        );

        for (const item of orderItemsForOrder) {
          const existing = skuMap.get(item.sku) || {
            totalQty: 0,
            breakdown: {},
          };
          existing.totalQty += item.quantity;
          existing.breakdown[basketLabel] =
            (existing.breakdown[basketLabel] || 0) + item.quantity;
          skuMap.set(item.sku, existing);
        }
      }

      // Create batch record
      const { data: newBatch, error: batchError } = await supabaseAdmin
        .from("batches")
        .insert({
          batch_code: batchCode,
          batch_type: type,
          similarity_score: score,
          status: "draft",
          order_count: group.length,
          total_items: skuMap.size,
          total_quantity: totalQuantity,
        })
        .select()
        .single();

      if (batchError || !newBatch) throw new Error(batchError?.message || "Batch insert failed");

      // Create batch_orders with basket labels
      for (let i = 0; i < group.length; i++) {
        await supabaseAdmin.from("batch_orders").insert({
          batch_id: newBatch.id,
          order_id: group[i].orderId,
          basket_label: BASKET_LABELS[i],
        });

        // Update order status
        await supabaseAdmin
          .from("orders")
          .update({ status: "batched", updated_at: new Date().toISOString() })
          .eq("id", group[i].orderId);
      }

      // Create batch_items with route positions
      for (const [sku, data] of skuMap) {
        const { data: location } = await supabaseAdmin
          .from("product_locations")
          .select("*")
          .eq("sku", sku)
          .limit(1)
          .single();

        const { data: product } = await supabaseAdmin
          .from("products")
          .select("*")
          .eq("sku", sku)
          .limit(1)
          .single();

        await supabaseAdmin.from("batch_items").insert({
          batch_id: newBatch.id,
          sku,
          product_title: product?.title || null,
          product_image_url: product?.image_url || null,
          author: product?.author || null,
          total_quantity: data.totalQty,
          basket_breakdown: data.breakdown,
          route_position: location?.route_position || 9999,
          zone_code: location?.zone_code || null,
          shelf_code: location?.shelf_code || null,
        });
      }

      created++;
    } catch (error) {
      errors.push(
        `Failed to create batch: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  if (created > 0) {
    await supabaseAdmin.from("activity_logs").insert({
      entity_type: "system",
      entity_id: 0,
      action: "batches_generated",
      details: {
        created_count: created,
        message: `Automatski grupirano preostale narudžbe (${created} novih batch-eva)`,
      },
    });
  }

  return { created, errors };
}
