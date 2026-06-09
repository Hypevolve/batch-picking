import { supabaseAdmin } from "@/server/db/supabase-admin";
import { generateBatchCode } from "@/lib/utils";

const BATCH_SIZE = 5;
const SMART_THRESHOLD = 0.1; // 10% overlap for "smart" classification
const ZONE_JACCARD_THRESHOLD = 0.3; // 30% zone overlap required for seeding (v3)
const EXCLUDED_SKUS = new Set(["9075"]); // delivery cost SKU — not a physical item

interface OrderWithItems {
  orderId: number;
  skus: string[];
}

interface OrderWithZones extends OrderWithItems {
  zones: Set<string>;
}

// ─── SKU Jaccard (v2 — kept as fallback) ────────────────────────────────────

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
 * Greedy grouping by SKU similarity (v2 — used as fallback when locations are missing)
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

// ─── Zone Jaccard (v3) ───────────────────────────────────────────────────────

/**
 * Attach a zone profile (Set of zone_codes) to each order.
 * SKU 9075 (delivery cost) is excluded. Orders with no mapped SKUs get an empty set.
 */
export function buildZoneProfiles(
  orders: OrderWithItems[],
  locationMap: Map<string, string>
): OrderWithZones[] {
  return orders.map((order) => ({
    ...order,
    zones: new Set(
      order.skus
        .filter((sku) => !EXCLUDED_SKUS.has(sku) && locationMap.has(sku))
        .map((sku) => locationMap.get(sku)!)
    ),
  }));
}

/**
 * Jaccard similarity between two zone sets
 */
export function calculateZoneJaccard(
  zonesA: Set<string>,
  zonesB: Set<string>
): number {
  const union = new Set([...zonesA, ...zonesB]);
  if (union.size === 0) return 0;
  const interSize = [...zonesA].filter((z) => zonesB.has(z)).length;
  return interSize / union.size;
}

/**
 * Zone-based greedy grouping (v3 algorithm):
 *   1. Seed  — best pair with zone_jaccard ≥ 30%
 *   2. Grow  — add candidate sharing ≥1 zone with ≥2 existing members
 *   3. Solo  — orders with no qualifying partner go as individual batches
 */
export function zoneBasedGroupOrders(
  ordersWithZones: OrderWithZones[],
  batchSize: number = BATCH_SIZE
): OrderWithItems[][] {
  const groups: OrderWithItems[][] = [];
  const assigned = new Set<number>();

  // Pre-compute qualified pairs (zone_jaccard ≥ threshold)
  const qualifiedPairs: Array<{
    key: string;
    sim: number;
    interSize: number;
  }> = [];

  for (let i = 0; i < ordersWithZones.length; i++) {
    for (let j = i + 1; j < ordersWithZones.length; j++) {
      const sim = calculateZoneJaccard(
        ordersWithZones[i].zones,
        ordersWithZones[j].zones
      );
      if (sim >= ZONE_JACCARD_THRESHOLD) {
        const interSize = [...ordersWithZones[i].zones].filter((z) =>
          ordersWithZones[j].zones.has(z)
        ).length;
        qualifiedPairs.push({
          key: `${ordersWithZones[i].orderId}-${ordersWithZones[j].orderId}`,
          sim,
          interSize,
        });
      }
    }
  }

  // Sort by jaccard desc, then intersection size desc (tiebreak)
  qualifiedPairs.sort((a, b) =>
    b.sim !== a.sim ? b.sim - a.sim : b.interSize - a.interSize
  );

  while (assigned.size < ordersWithZones.length) {
    const currentGroup: OrderWithZones[] = [];

    // Step 1: Seed — find best unassigned pair
    let seedFound = false;
    for (const { key } of qualifiedPairs) {
      const [idA, idB] = key.split("-").map(Number);
      if (!assigned.has(idA) && !assigned.has(idB)) {
        currentGroup.push(
          ordersWithZones.find((o) => o.orderId === idA)!,
          ordersWithZones.find((o) => o.orderId === idB)!
        );
        assigned.add(idA);
        assigned.add(idB);
        seedFound = true;
        break;
      }
    }

    if (!seedFound) {
      // Step 3: Solo — no qualifying partner found for remaining orders
      for (const order of ordersWithZones) {
        if (!assigned.has(order.orderId)) {
          groups.push([{ orderId: order.orderId, skus: order.skus }]);
          assigned.add(order.orderId);
        }
      }
      break;
    }

    // Step 2: Grow — add candidates meeting zone overlap condition
    while (currentGroup.length < batchSize) {
      let bestCandidate: OrderWithZones | null = null;
      let bestSharedZones = -1;

      for (const order of ordersWithZones) {
        if (assigned.has(order.orderId)) continue;

        // Count how many current members share at least 1 zone with this candidate
        const membersSharing = currentGroup.filter((member) =>
          [...order.zones].some((z) => member.zones.has(z))
        ).length;

        // Require sharing with ≥2 members once batch has ≥2 members
        const required = currentGroup.length >= 2 ? 2 : 1;
        if (membersSharing < required) continue;

        // Among valid candidates, prefer the one with most shared zone coverage
        const sharedZones = new Set(
          [...order.zones].filter((z) =>
            currentGroup.some((m) => m.zones.has(z))
          )
        ).size;

        if (sharedZones > bestSharedZones) {
          bestSharedZones = sharedZones;
          bestCandidate = order;
        }
      }

      if (bestCandidate) {
        currentGroup.push(bestCandidate);
        assigned.add(bestCandidate.orderId);
      } else {
        break;
      }
    }

    groups.push(currentGroup.map((o) => ({ orderId: o.orderId, skus: o.skus })));
  }

  return groups;
}

/**
 * Compute a numeric route position from zone sort order + shelf number.
 * Sorting batch_items by this value gives the optimal picking route.
 * Formula: zone_sort_order * 1000 + shelf_number
 */
export function computeRoutePosition(
  zoneCode: string | null,
  shelfCode: string | null,
  zoneSortMap: Map<string, number>
): number {
  if (!zoneCode || !shelfCode) return 9999;
  const sortOrder = zoneSortMap.get(zoneCode) ?? 9;
  const shelfNum = parseInt(shelfCode.replace(/[^0-9]/g, ""), 10) || 0;
  return sortOrder * 1000 + shelfNum;
}

// ─── Main entry point ────────────────────────────────────────────────────────

const BASKET_LABELS = ["A", "B", "C", "D", "E"] as const;

/**
 * Generate batches from unbatched orders using the v3 zone algorithm.
 * Orders whose SKUs have no location data fall back to v2 SKU Jaccard grouping.
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

  // Preload all product locations into a lookup map (sku → {zone_code, shelf_code})
  const { data: allLocations } = await supabaseAdmin
    .from("product_locations")
    .select("sku, zone_code, shelf_code");

  const locationMap = new Map<string, { zone_code: string; shelf_code: string }>();
  for (const loc of allLocations || []) {
    if (!locationMap.has(loc.sku)) {
      locationMap.set(loc.sku, { zone_code: loc.zone_code, shelf_code: loc.shelf_code });
    }
  }

  // Preload picking routes for route_position computation (zone_code → sort_order)
  const { data: routes } = await supabaseAdmin
    .from("picking_routes")
    .select("zone_code, sort_order");

  const zoneSortMap = new Map<string, number>();
  for (const route of routes || []) {
    zoneSortMap.set(route.zone_code, route.sort_order);
  }

  // Build orders with SKUs
  const ordersWithItems: OrderWithItems[] = unbatchedOrders.map(
    (order: { id: number }) => ({
      orderId: order.id,
      skus: items
        .filter((item: { order_id: number }) => item.order_id === order.id)
        .map((item: { sku: string }) => item.sku),
    })
  );

  // Preload all products for SKUs in these orders (eliminates N+1 queries)
  const allSkus = [...new Set(items.map((i: { sku: string }) => i.sku))];
  const { data: allProducts } = await supabaseAdmin
    .from("products")
    .select("sku, title, image_url, author")
    .in("sku", allSkus);

  const productMap = new Map<string, { title: string | null; image_url: string | null; author: string | null }>();
  for (const p of allProducts || []) {
    productMap.set(p.sku, { title: p.title, image_url: p.image_url, author: p.author });
  }

  // Split into zone-eligible orders (≥1 SKU has a location) and fallback orders
  const zoneLocationMap = new Map<string, string>();
  for (const [sku, loc] of locationMap) {
    zoneLocationMap.set(sku, loc.zone_code);
  }

  const ordersWithZones = buildZoneProfiles(ordersWithItems, zoneLocationMap);
  const zoneOrders = ordersWithZones.filter((o) => o.zones.size > 0);
  const fallbackOrders = ordersWithItems.filter(
    (o) => !ordersWithZones.find((z) => z.orderId === o.orderId)?.zones.size
  );

  // Group: zone algorithm for located orders, SKU Jaccard for the rest
  const groups: OrderWithItems[][] = [
    ...zoneBasedGroupOrders(zoneOrders),
    ...greedyGroupOrders(fallbackOrders),
  ];

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

      if (batchError || !newBatch)
        throw new Error(batchError?.message || "Batch insert failed");

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

      // Create batch_items with computed route positions (zone_sort_order * 1000 + shelf_num)
      for (const [sku, data] of skuMap) {
        const loc = locationMap.get(sku) ?? null;
        const product = productMap.get(sku) ?? null;

        const routePos = computeRoutePosition(
          loc?.zone_code ?? null,
          loc?.shelf_code ?? null,
          zoneSortMap
        );

        await supabaseAdmin.from("batch_items").insert({
          batch_id: newBatch.id,
          sku,
          product_title: product?.title || null,
          product_image_url: product?.image_url || null,
          author: product?.author || null,
          total_quantity: data.totalQty,
          basket_breakdown: data.breakdown,
          route_position: routePos,
          zone_code: loc?.zone_code ?? null,
          shelf_code: loc?.shelf_code ?? null,
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
