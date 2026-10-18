"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/trpc-client";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  MapPin,
  Package,
  Trophy,
  RefreshCw,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BatchInfo {
  id: number;
  batch_code: string;
  status: string;
  order_count: number;
  total_items: number;
  total_quantity: number;
}

interface PickItem {
  id: number;
  sku: string;
  product_title: string | null;
  product_image_url: string | null;
  author: string | null;
  total_quantity: number;
  basket_breakdown: Record<string, number> | null;
  zone_code: string | null;
  shelf_code: string | null;
  route_position: number;
  is_picked: boolean;
}

const basketColors: Record<string, string> = {
  A: "bg-rose-500 text-white",
  B: "bg-blue-600 text-white",
  C: "bg-emerald-600 text-white",
  D: "bg-amber-500 text-white",
  E: "bg-indigo-600 text-white",
};

export default function PickingPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = Number(params.id);

  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [items, setItems] = useState<PickItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  useEffect(() => {
    loadData();
  }, [batchId]);

  async function loadData() {
    try {
      const view = await api.batches.pickerView.query({ id: batchId });
      if (!view) {
        setLoading(false);
        return;
      }
      const b: BatchInfo = view.batch;

      // Auto-transition status to in_progress if currently ready
      if (b.status === "ready") {
        const started = await api.batches.updateStatus.mutate({ batchId, status: "in_progress" });
        if (started.success) b.status = "in_progress";
      }

      setBatch(b);
      setItems(view.items);
    } catch (err) {
      console.error("Učitavanje naloga nije uspjelo", err);
    }
    setLoading(false);
  }

  async function toggleItem(itemId: number) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const newPicked = !item.is_picked;
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, is_picked: newPicked } : i))
    );

    try {
      await api.batches.markItemPicked.mutate({ itemId, picked: newPicked });
    } catch (err) {
      // Not saved: put the checkbox back so the screen matches the database.
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, is_picked: !newPicked } : i))
      );
      alert("Stavka nije spremljena: " + apiErrorMessage(err));
    }
  }

  async function completeBatch() {
    setCompleting(true);
    try {
      // Server side this also marks every order of the batch as picked.
      const result = await api.batches.updateStatus.mutate({ batchId, status: "picked" });
      if (result.success) {
        setShowComplete(true);
      } else {
        alert("Nalog nije završen: " + (result.error ?? "nepoznata greška"));
      }
    } catch (err) {
      alert("Nalog nije završen: " + apiErrorMessage(err));
    }
    setCompleting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-ds-13 text-ds-text-muted">Učitavanje...</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="text-center py-12">
        <p className="text-ds-14 font-medium text-ds-text-primary">Nalog nije pronađen.</p>
        <Link href="/pick" className="inline-flex items-center gap-2 mt-3 text-ds-13 text-indigo-600 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" />
          Natrag
        </Link>
      </div>
    );
  }

  if (showComplete) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="bg-white border border-ds-border rounded-lg p-7 max-w-sm w-full space-y-5">
          <div className="w-12 h-12 bg-emerald-50 rounded flex items-center justify-center mx-auto">
            <Trophy className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-ds-18 font-semibold text-ds-text-primary">Sjajan posao!</h2>
            <p className="text-ds-13 text-ds-text-secondary mt-1">
              Nalog <span className="font-semibold text-ds-text-primary">{batch.batch_code}</span> je dovršen.
            </p>
          </div>
          <div className="flex items-center justify-between bg-ds-bg rounded px-4 py-2.5 text-ds-13">
            <span className="text-ds-text-secondary">Komisionirano:</span>
            <span className="font-semibold text-emerald-700">{batch.total_quantity} artikala</span>
          </div>
          <Link href="/pick" className="block w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-ds-14 font-medium rounded transition-colors">
            Preuzmi novi nalog
          </Link>
        </div>
      </div>
    );
  }

  const pickedCount = items.filter((i) => i.is_picked).length;
  const progress = items.length > 0 ? Math.round((pickedCount / items.length) * 100) : 0;
  const allPicked = pickedCount === items.length && items.length > 0;

  // Track current zone context for header groupings
  let currentZone = "";

  return (
    <div className="space-y-4 pb-32">
      {/* Sticky progress header */}
      <div className="sticky top-[49px] z-10 -mx-4 px-4 py-3 bg-white border-b border-ds-border">
        <div className="flex items-center gap-3">
          <Link href="/pick" className="p-1.5 text-ds-text-muted hover:text-ds-text-primary hover:bg-gray-100 rounded transition-colors cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-ds-15 font-semibold text-ds-text-primary truncate">{batch.batch_code}</p>
            <p className="text-ds-12 text-ds-text-muted">{pickedCount}/{items.length} stavki · {batch.order_count} narudžbi</p>
          </div>
          <span className={cn("text-ds-16 font-semibold", allPicked ? "text-emerald-600" : "text-indigo-600")}>{progress}%</span>
        </div>
        <div className="w-full bg-ds-border-subtle rounded-full h-1.5 mt-2.5">
          <div className={cn("h-full rounded-full transition-all duration-300", allPicked ? "bg-emerald-500" : "bg-indigo-600")} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-ds-border rounded-lg overflow-hidden">
        {items.map((item, idx) => {
          let showZoneHeader = false;
          if (item.zone_code && item.zone_code !== currentZone) {
            currentZone = item.zone_code;
            showZoneHeader = true;
          }

          return (
            <div key={item.id}>
              {showZoneHeader && (
                <div className="flex items-center gap-2 px-4 py-2 bg-ds-bg border-b border-ds-border-subtle">
                  <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">Zona {item.zone_code}</span>
                </div>
              )}

              <button
                onClick={() => toggleItem(item.id)}
                className={cn(
                  "w-full text-left select-none cursor-pointer transition-colors",
                  item.is_picked ? "bg-ds-bg" : "bg-white hover:bg-ds-bg",
                  idx !== items.length - 1 && "border-b border-ds-border-subtle"
                )}
              >
                <div className="flex items-center gap-3.5 px-4 py-3.5">
                  <div className="shrink-0">
                    {item.is_picked
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      : <Circle className="w-5 h-5 text-ds-text-disabled" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-ds-14 font-medium leading-snug",
                      item.is_picked ? "text-ds-text-muted line-through" : "text-ds-text-primary"
                    )}>
                      {item.product_title || item.sku}
                    </p>
                    {item.author && (
                      <p className={cn(
                        "text-ds-12 leading-snug mt-0.5",
                        item.is_picked ? "text-ds-text-muted" : "text-ds-text-secondary"
                      )}>
                        {item.author}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-ds-11 font-mono text-ds-text-muted">{item.sku}</span>
                      {item.shelf_code && (
                        <span className="text-ds-11 text-ds-text-secondary">· {item.shelf_code}</span>
                      )}
                      {item.basket_breakdown && Object.entries(item.basket_breakdown).map(([basket, qty]) => (
                        <span key={basket} className={cn("px-1.5 py-0.5 rounded text-ds-10 font-bold", basketColors[basket] || "bg-gray-200 text-gray-700")}>
                          {basket}{Number(qty) > 1 ? `×${qty}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className={cn(
                      "text-ds-16 font-semibold tabular-nums",
                      item.is_picked ? "text-emerald-600" : "text-ds-text-primary"
                    )}>{item.total_quantity}</span>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {allPicked && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-ds-border z-20 flex justify-center">
          <div className="w-full max-w-3xl">
            <button
              onClick={completeBatch}
              disabled={completing}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-ds-14 font-medium rounded transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {completing ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Završavanje...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Dovrši nalog</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
