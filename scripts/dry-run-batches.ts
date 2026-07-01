/**
 * DRY-RUN: usporedi staru vs novu logiku grupiranja batcheva na STVARNIM podacima.
 * Ne piše ništa u bazu — samo ispisuje kako bi narudžbe bile grupirane.
 *
 * Pokretanje:
 *   npx tsx scripts/dry-run-batches.ts
 *   npx tsx scripts/dry-run-batches.ts --recent 80   (simulacija na zadnjih N narudžbi bilo kojeg statusa)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  buildZoneProfiles,
  zoneBasedGroupOrders,
  greedyGroupOrders,
  calculateJaccardSimilarity,
  zonesAreAdjacent,
  calculateZoneJaccard,
} from "../src/server/services/batch-engine";

// ── mini .env.local loader ──────────────────────────────────────────────
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const EXCLUDED = new Set(["9075"]);
const recentArg = process.argv.indexOf("--recent");
const recentN = recentArg > -1 ? parseInt(process.argv[recentArg + 1] || "80", 10) : 0;

// ── OLD zone grouping (verbatim from commit 73a1985) ────────────────────
type OZ = { orderId: number; skus: string[]; zones: Set<string> };
function oldZoneGroup(orders: OZ[], zoneSortMap: Map<string, number>, batchSize = 5) {
  const groups: { orderId: number }[][] = [];
  const assigned = new Set<number>();
  const pairs: { key: string; sim: number; interSize: number }[] = [];
  for (let i = 0; i < orders.length; i++)
    for (let j = i + 1; j < orders.length; j++) {
      const combined = new Set([...orders[i].zones, ...orders[j].zones]);
      if (!zonesAreAdjacent(combined, zoneSortMap)) continue;
      const sim = calculateZoneJaccard(orders[i].zones, orders[j].zones);
      const interSize = [...orders[i].zones].filter((z) => orders[j].zones.has(z)).length;
      pairs.push({ key: `${orders[i].orderId}-${orders[j].orderId}`, sim, interSize });
    }
  pairs.sort((a, b) => (b.sim !== a.sim ? b.sim - a.sim : b.interSize - a.interSize));
  while (assigned.size < orders.length) {
    const g: OZ[] = [];
    let seeded = false;
    for (const { key } of pairs) {
      const [a, b] = key.split("-").map(Number);
      if (!assigned.has(a) && !assigned.has(b)) {
        g.push(orders.find((o) => o.orderId === a)!, orders.find((o) => o.orderId === b)!);
        assigned.add(a); assigned.add(b); seeded = true; break;
      }
    }
    if (!seeded) {
      for (const o of orders) if (!assigned.has(o.orderId)) { groups.push([{ orderId: o.orderId }]); assigned.add(o.orderId); }
      break;
    }
    while (g.length < batchSize) {
      let best: OZ | null = null, bestShared = -1;
      for (const o of orders) {
        if (assigned.has(o.orderId)) continue;
        const bz = new Set(g.flatMap((m) => [...m.zones]));
        for (const z of o.zones) bz.add(z);
        if (!zonesAreAdjacent(bz, zoneSortMap)) continue;
        const shared = new Set([...o.zones].filter((z) => g.some((m) => m.zones.has(z)))).size;
        if (shared > bestShared) { bestShared = shared; best = o; }
      }
      if (best) { g.push(best); assigned.add(best.orderId); } else break;
    }
    groups.push(g.map((o) => ({ orderId: o.orderId })));
  }
  return groups;
}

async function main() {
  // 1. Narudžbe
  let orderQuery = supabase.from("orders").select("id, status");
  let mode = "pending_batch";
  let { data: orders } = await orderQuery.eq("status", "pending_batch");
  if ((!orders || orders.length === 0) || recentN > 0) {
    mode = `SIMULACIJA na zadnjih ${recentN || 80} narudžbi (bilo koji status)`;
    const r = await supabase.from("orders").select("id, status").order("id", { ascending: false }).limit(recentN || 80);
    orders = r.data || [];
  }
  if (!orders || orders.length === 0) { console.log("Nema narudžbi za test."); return; }
  const orderIds = orders.map((o: { id: number }) => o.id);

  // 2. Stavke + lokacije + rute
  const { data: itemsRaw } = await supabase.from("order_items").select("order_id, sku, quantity").in("order_id", orderIds);
  const items = [...(itemsRaw || [])];

  // DEMO: kloniraj stvarnu narudžbu u identičnog blizanca (bez pisanja u bazu)
  const demoArg = process.argv.indexOf("--demo");
  if (demoArg > -1) {
    const src = parseInt(process.argv[demoArg + 1], 10);
    const twinId = src * 10 + 1;
    const clone = items.filter((it) => it.order_id === src).map((it) => ({ ...it, order_id: twinId }));
    if (clone.length === 0) { console.log(`Narudžba ${src} nema stavki za kloniranje.`); return; }
    items.push(...clone);
    orders.push({ id: twinId, status: "demo-twin" });
    console.log(`\n[DEMO] Kloniran identičan blizanac narudžbe ${src} → #${twinId} (${clone.length} stavki).`);
  }
  const { data: locs } = await supabase.from("product_locations").select("sku, zone_code");
  const { data: routes } = await supabase.from("picking_routes").select("zone_code, sort_order");
  const zoneOf = new Map<string, string>();
  for (const l of locs || []) if (!zoneOf.has(l.sku)) zoneOf.set(l.sku, l.zone_code);
  const zoneSortMap = new Map<string, number>();
  for (const r of routes || []) zoneSortMap.set(r.zone_code, r.sort_order);

  // 3. Gradnja narudžbi (isto kao generateBatches)
  const ordersWithItems = orders.map((o: { id: number }) => {
    const oi = (items || []).filter((it: { order_id: number }) => it.order_id === o.id);
    return {
      orderId: o.id,
      skus: oi.map((it: { sku: string }) => it.sku),
      bookCount: oi.filter((it: { sku: string }) => !EXCLUDED.has(it.sku)).reduce((s: number, it: { quantity: number }) => s + it.quantity, 0),
    };
  });
  const withZones = buildZoneProfiles(ordersWithItems, zoneOf);
  const zoneOrders = withZones.filter((o) => o.zones.size > 0);
  const fallback = ordersWithItems.filter((o) => !withZones.find((z) => z.orderId === o.orderId)?.zones.size);

  // 4. NOVO grupiranje
  const newGroups = [...zoneBasedGroupOrders(zoneOrders, zoneSortMap), ...greedyGroupOrders(fallback)];
  // 4b. STARO grupiranje (za usporedbu)
  const oldGroups = [...oldZoneGroup(zoneOrders as OZ[], zoneSortMap), ...greedyGroupOrders(fallback).map((g) => g)];

  const bc = new Map(ordersWithItems.map((o) => [o.orderId, o.bookCount]));
  const sk = new Map(ordersWithItems.map((o) => [o.orderId, o.skus]));
  const zn = new Map(withZones.map((o) => [o.orderId, [...o.zones].sort().join(",") || "—"]));

  // helper: batch dijeli knjige? (bilo koji par ≥50% SKU jaccard)
  const shareBooks = (ids: number[]) => {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        if (calculateJaccardSimilarity(sk.get(ids[i]) || [], sk.get(ids[j]) || []) >= 0.5) return true;
    return false;
  };

  console.log(`\n=== DRY-RUN grupiranja  (${mode}) ===`);
  console.log(`Narudžbi: ${orders.length} | s lokacijom (zonske): ${zoneOrders.length} | bez lokacije (fallback): ${fallback.length}`);
  console.log(`\nBatcheva  →  STARO: ${oldGroups.length}   NOVO: ${newGroups.length}\n`);

  console.log("── NOVI batchevi ──");
  newGroups.forEach((g, i) => {
    const ids = g.map((o) => o.orderId);
    const books = ids.reduce((s, id) => s + (bc.get(id) || 0), 0);
    const zones = [...new Set(ids.flatMap((id) => (zn.get(id) || "").split(",")))].filter(Boolean).sort().join(",");
    const flag = shareBooks(ids) ? "  ★ dijele knjige" : "";
    console.log(`  #${i + 1}  narudžbe [${ids.join(", ")}]  | ${books} knjiga | zone: ${zones}${flag}`);
  });

  // 5. Što je NOVO spojeno a STARO nije
  const oldBatchOf = new Map<number, number>();
  oldGroups.forEach((g, i) => g.forEach((o) => oldBatchOf.set(o.orderId, i)));
  const newlyMerged: string[] = [];
  for (const g of newGroups) {
    const ids = g.map((o) => o.orderId);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        if (oldBatchOf.get(ids[i]) !== oldBatchOf.get(ids[j]) && calculateJaccardSimilarity(sk.get(ids[i]) || [], sk.get(ids[j]) || []) >= 0.5)
          newlyMerged.push(`${ids[i]} + ${ids[j]}  (dijele knjige, prije u odvojenim batchevima)`);
  }
  console.log(`\n── NOVO spojeni parovi koje je staro razdvajalo (${newlyMerged.length}) ──`);
  newlyMerged.forEach((s) => console.log("  • " + s));
  if (newlyMerged.length === 0) console.log("  (nema — u ovom uzorku nema narudžbi s istim knjigama koje bi staro razdvojilo)");

  // 6. Sanity: nijedan batch ne prelazi 60 knjiga / 5 narudžbi
  const over = newGroups.filter((g) => g.map((o) => o.orderId).reduce((s, id) => s + (bc.get(id) || 0), 0) > 60 || g.length > 5);
  console.log(`\nProvjera limita (≤5 narudžbi, ≤60 knjiga): ${over.length === 0 ? "OK ✓" : "PREKORAČENJE u " + over.length + " batcheva!"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
