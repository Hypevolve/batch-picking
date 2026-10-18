import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

/**
 * Every read and write the browser used to send straight to Supabase now goes
 * through these tRPC procedures. Each one is checked with the role that uses it,
 * with the wrong role and with no session. The database is an in-memory double.
 */
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("@/server/db/supabase-admin", async () => {
  const { fakeSupabase } = await import("../helpers/fake-supabase");
  return { supabaseAdmin: fakeSupabase(db.tables) };
});

import { appRouter } from "@/server/trpc/router";

function session(role: "admin" | "picker", id = role === "admin" ? "1" : "2"): Session {
  return { user: { id, role, email: `${role}@test.local`, name: role }, expires: "2999-01-01T00:00:00.000Z" };
}
const asAdmin = () => appRouter.createCaller({ session: session("admin") });
const asPicker = () => appRouter.createCaller({ session: session("picker") });
const asAnon = () => appRouter.createCaller({ session: null });
type Caller = ReturnType<typeof asAdmin>;

const table = (name: string) => db.tables[name] as Row[];
const byId = (name: string, id: number) => table(name).find((r) => r.id === id)!;

function seed() {
  for (const key of Object.keys(db.tables)) delete db.tables[key];
  Object.assign(db.tables, {
    users: [
      { id: 1, email: "ana@test.local", name: "Ana", role: "admin", active: true, password_hash: "scrypt$secret-hash" },
      { id: 2, email: "pero@test.local", name: "Pero", role: "picker", active: true, password_hash: "scrypt$other-hash" },
    ],
    products: [
      { id: 1, sku: "SKU-1", title: "Knjiga 1" },
      { id: 2, sku: "SKU-2", title: "Knjiga 2" },
    ],
    product_locations: [{ id: 10, sku: "SKU-1", zone_code: "ZONA-A", shelf_code: "A1", route_position: 1 }],
    orders: [
      { id: 100, woo_order_id: 5001, customer_name: "Ivana Kupac", status: "batched", woo_status: "processing", synced_at: "2026-10-03T10:00:00Z" },
      { id: 101, woo_order_id: 5002, customer_name: "Marko Kupac", status: "pending_batch", woo_status: "processing", synced_at: "2026-10-02T10:00:00Z" },
      { id: 102, woo_order_id: 5003, customer_name: "Lana Kupac", status: "packed", woo_status: "processing", synced_at: "2026-10-01T10:00:00Z" },
    ],
    batches: [
      { id: 1, batch_code: "B-001", batch_type: "smart", status: "ready", order_count: 1, total_items: 1, total_quantity: 2, generated_at: "2026-10-04T08:00:00Z" },
      { id: 2, batch_code: "B-002", batch_type: "mixed", status: "in_progress", order_count: 1, total_items: 1, total_quantity: 1, generated_at: "2026-10-03T08:00:00Z" },
      { id: 3, batch_code: "B-003", batch_type: "mixed", status: "packed", order_count: 1, total_items: 1, total_quantity: 1, generated_at: "2026-10-02T08:00:00Z" },
      { id: 4, batch_code: "B-004", batch_type: "partial", status: "draft", order_count: 0, total_items: 0, total_quantity: 0, generated_at: "2026-10-01T08:00:00Z" },
    ],
    batch_orders: [
      { id: 1, batch_id: 1, order_id: 100, basket_label: "A" },
      { id: 3, batch_id: 3, order_id: 102, basket_label: "A" },
    ],
    batch_items: [
      { id: 1, batch_id: 1, sku: "SKU-1", product_title: "Knjiga 1", total_quantity: 2, route_position: 1, is_picked: false, basket_breakdown: { A: 2 } },
    ],
    activity_logs: [
      { id: 1, user_id: 2, entity_type: "batch", entity_id: 1, action: "status_changed", details: { from: "ready", to: "in_progress" }, created_at: "2026-10-04T09:00:00Z" },
    ],
  });
}

beforeEach(seed);

describe("picker screens (/pick): any signed-in user", () => {
  it("pickerOverview: counters and the batches that can be picked", async () => {
    const overview = await asPicker().batches.pickerOverview();

    expect(overview.counts).toEqual({ ready: 1, in_progress: 1, done: 1 });
    expect(overview.batches.map((b: Row) => b.batch_code)).toEqual(["B-001", "B-002"]);
    await expect(asAnon().batches.pickerOverview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("pickerView: the batch and its pick list, without customer data", async () => {
    const view = await asPicker().batches.pickerView({ id: 1 });

    expect(view?.batch).toMatchObject({ id: 1, batch_code: "B-001", status: "ready" });
    expect(view?.items).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain("Kupac");
    expect(await asPicker().batches.pickerView({ id: 999 })).toBeNull();
    await expect(asAnon().batches.pickerView({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("updateStatus: a picker starts and finishes a batch; its orders become picked", async () => {
    const picker = asPicker();

    expect(await picker.batches.updateStatus({ batchId: 1, status: "in_progress" })).toEqual({ success: true });
    expect(byId("batches", 1)).toMatchObject({ status: "in_progress" });
    expect(byId("batches", 1).started_at).toBeTruthy();

    expect(await picker.batches.updateStatus({ batchId: 1, status: "picked" })).toEqual({ success: true });
    expect(byId("batches", 1)).toMatchObject({ status: "picked" });
    expect(byId("batches", 1).completed_at).toBeTruthy();
    expect(byId("orders", 100)).toMatchObject({ status: "picked" });
    expect(table("activity_logs").filter((l) => l.user_id === 2)).toHaveLength(3);
  });

  it("updateStatus: an invalid transition is refused and changes nothing", async () => {
    const result = await asPicker().batches.updateStatus({ batchId: 4, status: "picked" });

    expect(result).toMatchObject({ success: false });
    expect(byId("batches", 4)).toMatchObject({ status: "draft" });
  });

  it("updateStatus: a picker cannot make the admin's transitions; no session gets nothing", async () => {
    await expect(asPicker().batches.updateStatus({ batchId: 4, status: "ready" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(asPicker().batches.updateStatus({ batchId: 3, status: "synced" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(asAnon().batches.updateStatus({ batchId: 1, status: "in_progress" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(byId("batches", 4)).toMatchObject({ status: "draft" });
    expect(byId("batches", 3)).toMatchObject({ status: "packed" });
    expect(byId("batches", 1)).toMatchObject({ status: "ready" });
  });

  it("markItemPicked: a picker ticks an item; no session cannot", async () => {
    await asPicker().batches.markItemPicked({ itemId: 1, picked: true });
    expect(byId("batch_items", 1)).toMatchObject({ is_picked: true });

    await expect(asAnon().batches.markItemPicked({ itemId: 1, picked: false })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(byId("batch_items", 1)).toMatchObject({ is_picked: true });
  });
});

describe("admin screens: admin only", () => {
  it("dashboard.stats: the four counters", async () => {
    expect(await asAdmin().dashboard.stats()).toEqual({ orders: 3, batches: 4, picked: 0, packed: 1 });
  });

  it("dashboard.recentActivity: joins the user's name and nothing else from users", async () => {
    const logs = await asAdmin().dashboard.recentActivity();

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "status_changed", users: { name: "Pero" } });
    expect(JSON.stringify(logs)).not.toContain("scrypt$");
    expect(JSON.stringify(logs)).not.toContain("@test.local");
  });

  it("orders.page: one page, newest first, with the total; only the listed columns", async () => {
    const first = await asAdmin().orders.page({ page: 1, pageSize: 2 });
    const second = await asAdmin().orders.page({ page: 2, pageSize: 2 });

    expect(first.total).toBe(3);
    expect(first.orders.map((o: Row) => o.woo_order_id)).toEqual([5001, 5002]);
    expect(second.orders.map((o: Row) => o.woo_order_id)).toEqual([5003]);
    expect(Object.keys(first.orders[0]).sort()).toEqual(["customer_name", "id", "status", "synced_at", "woo_order_id", "woo_status"]);
    // Past the end (orders deleted meanwhile): an empty page, so the screen returns to page 1.
    expect(await asAdmin().orders.page({ page: 9, pageSize: 2 })).toEqual({ orders: [], total: 0 });
  });

  it("batches.list and batches.getById: the Batchevi screens", async () => {
    const admin = asAdmin();

    expect((await admin.batches.list()).map((b: Row) => b.id)).toEqual([1, 2, 3, 4]);
    const detail = await admin.batches.getById({ id: 1 });
    expect(detail).toMatchObject({ id: 1, batch_code: "B-001" });
    expect(detail?.orders).toEqual([
      { id: 1, basket_label: "A", order_id: 100, orders: { customer_name: "Ivana Kupac", woo_order_id: 5001 } },
    ]);
    expect(detail?.items).toHaveLength(1);
    expect(await admin.batches.getById({ id: 999 })).toBeNull();
  });

  it("batches.updateStatus: the admin makes every transition, e.g. draft→ready and packed→synced", async () => {
    expect(await asAdmin().batches.updateStatus({ batchId: 4, status: "ready" })).toEqual({ success: true });
    expect(await asAdmin().batches.updateStatus({ batchId: 3, status: "synced" })).toEqual({ success: true });
    expect(byId("batches", 4)).toMatchObject({ status: "ready" });
    expect(byId("batches", 3)).toMatchObject({ status: "synced" });
  });

  it("batches.markItemPicked: also used on the admin batch screen", async () => {
    await asAdmin().batches.markItemPicked({ itemId: 1, picked: true });
    expect(byId("batch_items", 1)).toMatchObject({ is_picked: true });
  });

  it("locations: list, create, update, delete", async () => {
    const admin = asAdmin();

    expect(await admin.locations.list()).toHaveLength(1);

    await admin.locations.create({ sku: "SKU-2", zoneCode: "ZONA-B", shelfCode: "B2", routePosition: 5 });
    expect(table("product_locations").find((l) => l.sku === "SKU-2")).toMatchObject({ zone_code: "ZONA-B", shelf_code: "B2", route_position: 5 });

    await admin.locations.update({ id: 10, sku: "SKU-1", zoneCode: "ZONA-C", shelfCode: "C3", routePosition: 7 });
    expect(byId("product_locations", 10)).toMatchObject({ zone_code: "ZONA-C", shelf_code: "C3", route_position: 7 });

    await admin.locations.delete({ id: 10 });
    expect(table("product_locations").some((l) => l.id === 10)).toBe(false);
  });

  it("locations: the database error reaches the screen (unknown SKU)", async () => {
    await expect(
      asAdmin().locations.create({ sku: "NEPOSTOJECI", zoneCode: "ZONA-A", shelfCode: "A1", routePosition: 1 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("foreign key") });
    await expect(
      asAdmin().locations.update({ id: 10, sku: "NEPOSTOJECI", zoneCode: "ZONA-A", shelfCode: "A1", routePosition: 1 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(byId("product_locations", 10)).toMatchObject({ sku: "SKU-1" });
  });

  it("locations.bulkImport: updates known SKUs, inserts new ones, reports failed rows by CSV line", async () => {
    const result = await asAdmin().locations.bulkImport([
      { row: 2, sku: "SKU-1", zoneCode: "ZONA-D", shelfCode: "D1", routePosition: 3 },
      { row: 3, sku: "SKU-2", zoneCode: "ZONA-E", shelfCode: "E1", routePosition: 4 },
      { row: 4, sku: "NEPOSTOJECI", zoneCode: "ZONA-E", shelfCode: "E2", routePosition: 5 },
    ]);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^Red 4 \(NEPOSTOJECI\): /);
    expect(byId("product_locations", 10)).toMatchObject({ zone_code: "ZONA-D", shelf_code: "D1", route_position: 3 });
    expect(table("product_locations").find((l) => l.sku === "SKU-2")).toMatchObject({ zone_code: "ZONA-E" });
  });

  const adminOnly: Array<[string, (c: Caller) => Promise<unknown>]> = [
    ["dashboard.stats", (c) => c.dashboard.stats()],
    ["dashboard.recentActivity", (c) => c.dashboard.recentActivity()],
    ["orders.page", (c) => c.orders.page({ page: 1, pageSize: 25 })],
    ["orders.list", (c) => c.orders.list()],
    ["orders.getById", (c) => c.orders.getById({ id: 100 })],
    ["batches.list", (c) => c.batches.list()],
    ["batches.getById", (c) => c.batches.getById({ id: 1 })],
    ["locations.list", (c) => c.locations.list()],
    ["locations.create", (c) => c.locations.create({ sku: "SKU-2", zoneCode: "Z", shelfCode: "S", routePosition: 1 })],
    ["locations.update", (c) => c.locations.update({ id: 10, sku: "SKU-2", zoneCode: "Z", shelfCode: "S", routePosition: 1 })],
    ["locations.delete", (c) => c.locations.delete({ id: 10 })],
    ["locations.bulkImport", (c) => c.locations.bulkImport([{ row: 2, sku: "SKU-2", zoneCode: "Z", shelfCode: "S", routePosition: 1 }])],
  ];

  it.each(adminOnly)("%s: FORBIDDEN for a picker, UNAUTHORIZED without a session, and changes nothing", async (_name, call) => {
    const before = JSON.stringify(db.tables);

    await expect(call(asPicker())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call(asAnon())).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(JSON.stringify(db.tables)).toBe(before);
  });
});
