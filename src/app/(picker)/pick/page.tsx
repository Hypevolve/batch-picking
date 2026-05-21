"use client";

import { Package, Play, CheckCircle2, Clock, ChevronRight, Layers, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface PickerBatch {
  id: number;
  batch_code: string;
  batch_type: string;
  status: string;
  order_count: number;
  total_items: number;
  total_quantity: number;
}

const statusLabels: Record<string, string> = {
  ready: "Spreman",
  in_progress: "U tijeku",
};

const statusDotColors: Record<string, string> = {
  ready: "bg-amber-500",
  in_progress: "bg-blue-500",
};

export default function PickerHomePage() {
  const [counts, setCounts] = useState({ ready: 0, in_progress: 0, done: 0 });
  const [batches, setBatches] = useState<PickerBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const [ready, inProgress, done, batchList] = await Promise.all([
        supabase.from("batches").select("id", { count: "exact", head: true }).eq("status", "ready"),
        supabase.from("batches").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("batches").select("id", { count: "exact", head: true }).in("status", ["picked", "packed", "synced"]),
        supabase
          .from("batches")
          .select("id, batch_code, batch_type, status, order_count, total_items, total_quantity")
          .in("status", ["ready", "in_progress"])
          .order("generated_at", { ascending: false }),
      ]);
      setCounts({ ready: ready.count || 0, in_progress: inProgress.count || 0, done: done.count || 0 });
      setBatches(batchList.data || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Spremni", value: counts.ready, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", topBorder: "border-t-2 border-t-amber-500", sub: "Čekaju početak" },
          { label: "U tijeku", value: counts.in_progress, icon: Play, color: "text-blue-600", bg: "bg-blue-50", topBorder: "border-t-2 border-t-blue-500", sub: "Aktivni nalozi" },
          { label: "Završeni", value: counts.done, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", topBorder: "border-t-2 border-t-emerald-500", sub: "Dovršeni danas" },
        ].map((s) => (
          <div key={s.label} className={cn("bg-white border border-ds-border rounded-lg px-5 py-4", s.topBorder)}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">{s.label}</span>
              <div className={cn("w-7 h-7 rounded flex items-center justify-center", s.bg)}>
                <s.icon className={cn("w-3.5 h-3.5", s.color)} />
              </div>
            </div>
            <p className="text-ds-36 font-semibold text-ds-text-primary tracking-tight leading-none">{loading ? "–" : s.value}</p>
            <p className="text-ds-11 text-ds-text-muted mt-2">{s.sub}</p>
          </div>
        ))}
      </div>

      {loading && (
        <div className="bg-white border border-ds-border rounded-lg p-10 text-center">
          <p className="text-ds-13 text-ds-text-muted">Učitavanje...</p>
        </div>
      )}

      {!loading && batches.length > 0 && (
        <div className="space-y-3">
          <p className="text-ds-12 font-medium text-ds-text-muted uppercase tracking-wide">Dostupni nalozi</p>
          <div className="bg-white border border-ds-border rounded-lg overflow-hidden">
            {batches.map((batch, idx) => (
              <Link
                key={batch.id}
                href={`/pick/${batch.id}`}
                className={cn(
                  "flex items-center justify-between px-4 py-4 hover:bg-ds-bg transition-colors group",
                  idx !== batches.length - 1 && "border-b border-ds-border-subtle"
                )}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 bg-indigo-50 rounded flex items-center justify-center">
                    <Layers className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-ds-15 font-semibold text-ds-text-primary">{batch.batch_code}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full", statusDotColors[batch.status] || "bg-gray-400")} />
                      <span className="text-ds-12 text-ds-text-muted">{statusLabels[batch.status]}</span>
                      <span className="text-ds-text-disabled">·</span>
                      <span className="text-ds-12 text-ds-text-muted">{batch.order_count} narudžbi · {batch.total_quantity} kom</span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-ds-text-disabled group-hover:text-ds-text-muted transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loading && batches.length === 0 && (
        <div className="bg-white border border-ds-border rounded-lg p-10 text-center">
          <Package className="w-8 h-8 text-ds-text-disabled mx-auto mb-3" />
          <p className="text-ds-14 font-medium text-ds-text-primary">Nema aktivnih naloga</p>
          <p className="text-ds-12 text-ds-text-muted mt-1">Pričekajte dok administrator ne generira nove naloge.</p>
        </div>
      )}
    </div>
  );
}
