import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { importSingleWooOrder } from "@/server/services/woo-sync";
import { supabaseAdmin } from "@/server/db/supabase-admin";
import { type WooOrder } from "@/lib/woocommerce";

export async function POST(req: NextRequest) {
  console.log("📥 Received WooCommerce Webhook request.");

  const signature = req.headers.get("x-wc-webhook-signature");
  const topic = req.headers.get("x-wc-webhook-topic");
  const webhookId = req.headers.get("x-wc-webhook-id");

  if (!signature) {
    console.error("❌ Missing WooCommerce webhook signature header.");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const secret = process.env.WOO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("❌ WOO_WEBHOOK_SECRET is not configured in .env.");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // 1. Read raw body for HMAC validation
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    console.error("❌ Failed to read raw body:", err);
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // 2. Validate HMAC signature
  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  if (computedSignature !== signature) {
    console.error("❌ Webhook signature verification failed.", {
      received: signature,
      computed: computedSignature,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  console.log(`✅ Webhook signature verified. ID: ${webhookId}, Topic: ${topic}`);

  // 3. Parse payload
  let payload: WooOrder;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("❌ Failed to parse payload JSON:", err);
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const wooOrderId = payload.id;
  if (!wooOrderId) {
    console.error("❌ Webhook payload missing order ID.");
    return NextResponse.json({ error: "Missing order ID in payload" }, { status: 400 });
  }

  try {
    // 4. Handle based on topic / status
    if (payload.status === "processing") {
      console.log(`📦 Processing order #${wooOrderId}. Importing...`);
      const importResult = await importSingleWooOrder(payload);

      if (importResult.status === "synced") {
        console.log(`✅ Successfully synced order #${wooOrderId} via webhook.`);
        
        await supabaseAdmin.from("activity_logs").insert({
          entity_type: "system",
          entity_id: wooOrderId,
          action: "woocommerce_sync",
          details: {
            synced: 1,
            skipped: 0,
            method: "webhook",
            order_id: wooOrderId,
          },
        });

        return NextResponse.json({ success: true, action: "imported", orderId: wooOrderId });
      } else if (importResult.status === "skipped") {
        console.log(`ℹ️ Order #${wooOrderId} already exists, skipping.`);
        return NextResponse.json({ success: true, action: "skipped", orderId: wooOrderId });
      } else {
        console.error(`❌ Failed to import order #${wooOrderId}:`, importResult.error);
        return NextResponse.json({ error: importResult.error }, { status: 500 });
      }
    } else {
      // For non-processing statuses (e.g. cancelled, refunded, completed), update the local order if we have it
      console.log(`ℹ️ Order #${wooOrderId} status is '${payload.status}'. Syncing status locally...`);

      const { data: existingOrder } = await supabaseAdmin
        .from("orders")
        .select("id, status")
        .eq("woo_order_id", wooOrderId)
        .maybeSingle();

      if (existingOrder) {
        const { error: updateError } = await supabaseAdmin
          .from("orders")
          .update({
            woo_status: payload.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingOrder.id);

        if (updateError) {
          throw new Error(`Failed to update local order status: ${updateError.message}`);
        }

        console.log(`✅ Updated local order #${wooOrderId} status to '${payload.status}'.`);
        return NextResponse.json({ success: true, action: "updated_status", orderId: wooOrderId });
      }

      console.log(`ℹ️ Order #${wooOrderId} not found locally, no update needed.`);
      return NextResponse.json({ success: true, action: "ignored_not_found", orderId: wooOrderId });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Webhook error processing order #${wooOrderId}:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
