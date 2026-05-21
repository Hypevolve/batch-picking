import { supabaseAdmin } from "@/server/db/supabase-admin";
import {
  fetchProcessingOrders,
  fetchProductBySku,
  type WooOrder,
} from "@/lib/woocommerce";

/**
 * Sync processing orders from WooCommerce into local database.
 * Idempotent: will not create duplicates.
 */
export async function syncOrders(): Promise<{
  synced: number;
  skipped: number;
  errors: string[];
}> {
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  let page = 1;
  let hasMore = true;

  while (hasMore) {
    let wooOrders: WooOrder[];
    try {
      wooOrders = await fetchProcessingOrders(page, 100);
    } catch (error) {
      errors.push(
        `Failed to fetch page ${page}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      break;
    }

    if (wooOrders.length === 0) {
      hasMore = false;
      break;
    }

    for (const wooOrder of wooOrders) {
      const res = await importSingleWooOrder(wooOrder);
      if (res.status === "synced") {
        synced++;
      } else if (res.status === "skipped") {
        skipped++;
      } else if (res.status === "error") {
        errors.push(`Order #${wooOrder.id}: ${res.error}`);
      }
    }

    page++;
    if (wooOrders.length < 100) hasMore = false;
  }

  if (synced > 0) {
    await supabaseAdmin.from("activity_logs").insert({
      entity_type: "system",
      entity_id: 0,
      action: "woocommerce_sync",
      details: {
        synced,
        skipped,
        method: "manual",
      },
    });
  }

  return { synced, skipped, errors };
}

/**
 * Import a single WooCommerce order into the local database.
 * Idempotent: skips if order already exists.
 */
export async function importSingleWooOrder(wooOrder: WooOrder): Promise<{
  status: "synced" | "skipped" | "error";
  error?: string;
}> {
  try {
    // Check if order already exists
    const { data: existing } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("woo_order_id", wooOrder.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return { status: "skipped" };
    }

    // Insert order
    const customerName = `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`.trim();
    const { data: newOrder, error: insertError } = await supabaseAdmin
      .from("orders")
      .insert({
        woo_order_id: wooOrder.id,
        customer_name: customerName,
        status: "pending_batch",
        woo_status: wooOrder.status,
      })
      .select()
      .single();

    if (insertError || !newOrder) {
      throw new Error(insertError?.message || "Order insert failed");
    }

    // Insert order items
    for (const item of wooOrder.line_items) {
      if (!item.sku) continue; // Skip items without SKU

      await supabaseAdmin.from("order_items").insert({
        order_id: newOrder.id,
        sku: item.sku,
        quantity: item.quantity,
        product_title_snapshot: item.name,
        product_image_snapshot: item.image?.src || null,
      });

      // Ensure product exists in cache
      await ensureProductCached(item.sku, item.name, item.image?.src);
    }

    return { status: "synced" };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Ensure a product exists in local cache, fetching from Woo if needed
 */
async function ensureProductCached(
  sku: string,
  fallbackTitle: string,
  fallbackImage?: string | null
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("sku", sku)
    .limit(1);

  if (existing && existing.length > 0) return;

  // Try to fetch full product data from WooCommerce
  let title = fallbackTitle;
  let imageUrl = fallbackImage || null;
  let author: string | null = null;
  let wooProductId: number | null = null;

  try {
    const wooProduct = await fetchProductBySku(sku);
    if (wooProduct) {
      title = wooProduct.name;
      wooProductId = wooProduct.id;
      imageUrl =
        wooProduct.images.length > 0 ? wooProduct.images[0].src : imageUrl;

      // Try to extract author from meta data
      const authorMeta = wooProduct.meta_data.find(
        (m) =>
          m.key === "author" ||
          m.key === "_author" ||
          m.key === "book_author"
      );
      if (authorMeta) {
        author = authorMeta.value;
      }
    }
  } catch {
    // Use fallback data if Woo fetch fails
  }

  await supabaseAdmin.from("products").insert({
    sku,
    title,
    image_url: imageUrl,
    author,
    woo_product_id: wooProductId,
  });
}
