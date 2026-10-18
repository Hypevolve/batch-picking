import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// No database and no WooCommerce: the import service and Supabase are test doubles.
const db = vi.hoisted(() => ({ tables: { orders: [], activity_logs: [] } as Record<string, Array<Record<string, unknown>>> }));
vi.mock("@/server/db/supabase-admin", async () => {
  const { fakeSupabase } = await import("../helpers/fake-supabase");
  return { supabaseAdmin: fakeSupabase(db.tables) };
});
const importSingleWooOrder = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/woo-sync", () => ({ importSingleWooOrder }));

import { POST } from "@/app/api/webhooks/woocommerce/route";

const SECRET = "test-webhook-secret-7f3a9c";
const BODY_MARKER = "Body-Marker-Customer-QX81";
const body = JSON.stringify({ id: 4242, status: "processing", billing: { first_name: BODY_MARKER } });
const sign = (raw: string, secret = SECRET) => crypto.createHmac("sha256", secret).update(raw, "utf8").digest("base64");

function request(raw: string, signature?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-wc-webhook-topic": "order.updated",
    "x-wc-webhook-id": "17",
  };
  if (signature !== undefined) headers["x-wc-webhook-signature"] = signature;
  return new NextRequest("http://localhost/api/webhooks/woocommerce", { method: "POST", body: raw, headers });
}

let logged: string[] = [];
beforeEach(() => {
  process.env.WOO_WEBHOOK_SECRET = SECRET;
  db.tables.orders.length = 0;
  db.tables.activity_logs.length = 0;
  importSingleWooOrder.mockReset();
  importSingleWooOrder.mockResolvedValue({ status: "synced" });
  logged = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WOO_WEBHOOK_SECRET;
});

function expectNothingSensitiveLogged(signature?: string) {
  const all = logged.join("\n");
  expect(all).not.toContain(SECRET);
  expect(all).not.toContain(BODY_MARKER);
  expect(all).not.toContain(sign(body));
  if (signature) expect(all).not.toContain(signature);
}

describe("WooCommerce webhook signature", () => {
  it("accepts a valid signature and processes the order", async () => {
    const res = await POST(request(body, sign(body)));

    expect(res.status).toBe(200);
    expect(importSingleWooOrder).toHaveBeenCalledTimes(1);
    expect(importSingleWooOrder.mock.calls[0][0]).toMatchObject({ id: 4242 });
    expectNothingSensitiveLogged(sign(body));
  });

  it("rejects an invalid signature of the right length", async () => {
    const wrong = sign(body, "some-other-secret");
    expect(wrong).toHaveLength(sign(body).length);

    const res = await POST(request(body, wrong));

    expect(res.status).toBe(401);
    expect(importSingleWooOrder).not.toHaveBeenCalled();
    expectNothingSensitiveLogged(wrong);
  });

  it("rejects a signature over a tampered body", async () => {
    const res = await POST(request(body.replace("4242", "4243"), sign(body)));

    expect(res.status).toBe(401);
    expect(importSingleWooOrder).not.toHaveBeenCalled();
  });

  it("rejects a signature of a different length without comparing", async () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");
    for (const bad of ["abc", sign(body) + "AA", sign(body).slice(0, -1), " "]) {
      const res = await POST(request(body, bad));
      expect(res.status).toBe(401);
    }
    expect(spy).not.toHaveBeenCalled();
    expect(importSingleWooOrder).not.toHaveBeenCalled();
  });

  it("rejects a missing signature", async () => {
    const res = await POST(request(body));

    expect(res.status).toBe(401);
    expect(importSingleWooOrder).not.toHaveBeenCalled();
    expectNothingSensitiveLogged();
  });

  it("compares with timingSafeEqual on equal-length buffers", async () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");

    await POST(request(body, sign(body, "some-other-secret")));
    await POST(request(body, sign(body)));

    expect(spy).toHaveBeenCalledTimes(2);
    for (const [a, b] of spy.mock.calls as Array<[Buffer, Buffer]>) {
      expect(a.length).toBe(b.length);
    }
  });

  it("refuses to process anything when the secret is not configured", async () => {
    delete process.env.WOO_WEBHOOK_SECRET;

    const res = await POST(request(body, sign(body)));

    expect(res.status).toBe(500);
    expect(importSingleWooOrder).not.toHaveBeenCalled();
  });

  it("does not log the body when a signed payload is not valid JSON", async () => {
    const raw = `${BODY_MARKER} is not json`;

    const res = await POST(request(raw, sign(raw)));

    expect(res.status).toBe(400);
    expect(logged.join("\n")).not.toContain(BODY_MARKER.slice(0, 8));
  });
});
