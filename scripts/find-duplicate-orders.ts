/** Nađi STVARNE parove narudžbi koje dijele iste/većinu knjiga (SKU Jaccard ≥ 0.5). Read-only. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { calculateJaccardSimilarity } from "../src/server/services/batch-engine";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const EXCLUDED = new Set(["9075"]);
const N = parseInt(process.argv[2] || "1000", 10);

async function main() {
  const { data: orders } = await supabase.from("orders").select("id, status").order("id", { ascending: false }).limit(N);
  const ids = (orders || []).map((o: { id: number }) => o.id);
  const { data: items } = await supabase.from("order_items").select("order_id, sku").in("order_id", ids);
  const skusByOrder = new Map<number, string[]>();
  for (const it of items || []) {
    if (EXCLUDED.has(it.sku)) continue;
    const a = skusByOrder.get(it.order_id) || [];
    a.push(it.sku); skusByOrder.set(it.order_id, a);
  }
  const list = [...skusByOrder.entries()].filter(([, s]) => s.length > 0);
  const hits: { a: number; b: number; sim: number; shared: number }[] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const sim = calculateJaccardSimilarity(list[i][1], list[j][1]);
      if (sim >= 0.5) {
        const setB = new Set(list[j][1]);
        const shared = [...new Set(list[i][1])].filter((x) => setB.has(x)).length;
        hits.push({ a: list[i][0], b: list[j][0], sim, shared });
      }
    }
  hits.sort((x, y) => y.sim - x.sim);
  console.log(`Skenirano ${list.length} narudžbi sa stavkama (od zadnjih ${N}).`);
  console.log(`Parova s ≥50% preklapanja knjiga: ${hits.length}\n`);
  hits.slice(0, 25).forEach((h) =>
    console.log(`  ${h.a} + ${h.b}  | jaccard ${h.sim.toFixed(2)} | zajedničkih naslova: ${h.shared}`)
  );
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
