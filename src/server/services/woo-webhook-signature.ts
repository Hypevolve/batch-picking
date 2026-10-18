import crypto from "node:crypto";

/**
 * Verifies WooCommerce's `X-WC-Webhook-Signature` header: base64 of
 * HMAC-SHA256(raw body, webhook secret). Constant-time comparison; a header
 * of the wrong length is rejected before comparing.
 */
export function verifyWooWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"),
    "utf8"
  );
  const received = Buffer.from(signature, "utf8");
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}
