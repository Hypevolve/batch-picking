"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  Package,
  Layers,
  MapPin,
  ClipboardList,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BatchDetail {
  id: number;
  batch_code: string;
  batch_type: string;
  status: string;
  order_count: number;
  total_items: number;
  total_quantity: number;
  similarity_score: number;
  generated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface BatchOrder {
  id: number;
  basket_label: string;
  order_id: number;
  orders: unknown;
}

interface BatchItem {
  id: number;
  sku: string;
  product_title: string | null;
  total_quantity: number;
  basket_breakdown: Record<string, number> | null;
  zone_code: string | null;
  shelf_code: string | null;
  route_position: number;
  is_picked: boolean;
}

const statusConfig: Record<string, { label: string; badge: string }> = {
  draft:       { label: "Nacrt",         badge: "bg-gray-100 text-gray-600" },
  ready:       { label: "Spreman",       badge: "bg-amber-50 text-amber-700" },
  in_progress: { label: "U tijeku",      badge: "bg-blue-50 text-blue-700" },
  picked:      { label: "Pokupljen",     badge: "bg-indigo-50 text-indigo-700" },
  packed:      { label: "Spakiran",      badge: "bg-purple-50 text-purple-700" },
  synced:      { label: "Sinkroniziran", badge: "bg-emerald-50 text-emerald-700" },
};

const nextStatus: Record<string, string> = {
  draft: "ready",
  ready: "in_progress",
  in_progress: "picked",
  picked: "packed",
  packed: "synced",
};

const nextStatusLabels: Record<string, string> = {
  draft: "Označi spreman",
  ready: "Započni skupljanje",
  in_progress: "Označi pokupljen",
  picked: "Označi spakiran",
  packed: "Sinkroniziraj na WooCommerce",
};

function getOrderField(orders: unknown, field: string): string {
  if (!orders) return "";
  const obj = Array.isArray(orders) ? orders[0] : orders;
  return obj?.[field] ?? "";
}

const basketColors: Record<string, string> = {
  A: "bg-red-500 text-white",
  B: "bg-blue-500 text-white",
  C: "bg-emerald-500 text-white",
  D: "bg-amber-500 text-white",
  E: "bg-purple-500 text-white",
};

const basketLightColors: Record<string, string> = {
  A: "bg-red-50 text-red-700",
  B: "bg-blue-50 text-blue-700",
  C: "bg-emerald-50 text-emerald-700",
  D: "bg-amber-50 text-amber-700",
  E: "bg-purple-50 text-purple-700",
};

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = Number(params.id);

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [orders, setOrders] = useState<BatchOrder[]>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    loadBatch();
  }, [batchId]);

  async function loadBatch() {
    const supabase = createClient();

    const { data: b } = await supabase
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .single();

    if (!b) {
      setLoading(false);
      return;
    }
    setBatch(b);

    const { data: bo } = await supabase
      .from("batch_orders")
      .select("id, basket_label, order_id, orders(customer_name, woo_order_id)")
      .eq("batch_id", batchId);
    setOrders((bo as BatchOrder[]) || []);

    const { data: bi } = await supabase
      .from("batch_items")
      .select("*")
      .eq("batch_id", batchId)
      .order("route_position", { ascending: true });
    setItems(bi || []);

    setLoading(false);
  }

  async function handleTransition() {
    if (!batch) return;
    const next = nextStatus[batch.status];
    if (!next) return;

    setTransitioning(true);
    const supabase = createClient();

    const updateData: Record<string, unknown> = {
      status: next,
      updated_at: new Date().toISOString(),
    };
    if (next === "in_progress") updateData.started_at = new Date().toISOString();
    if (next === "picked" || next === "packed")
      updateData.completed_at = new Date().toISOString();

    await supabase.from("batches").update(updateData).eq("id", batchId);

    // Update order statuses
    if (next === "picked" || next === "packed") {
      const orderStatus = next === "picked" ? "picked" : "packed";
      for (const o of orders) {
        await supabase
          .from("orders")
          .update({ status: orderStatus, updated_at: new Date().toISOString() })
          .eq("id", o.order_id);
      }
    }

    setTransitioning(false);
    loadBatch();
  }

  async function toggleItemPicked(itemId: number, currentlyPicked: boolean) {
    const supabase = createClient();
    await supabase
      .from("batch_items")
      .update({ is_picked: !currentlyPicked })
      .eq("id", itemId);
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, is_picked: !currentlyPicked } : i))
    );
  }

  if (loading) {
    return (
      <div className="bg-white border border-ds-border rounded-lg p-10 text-center">
        <p className="text-ds-13 text-ds-text-muted">Učitavanje...</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="bg-white border border-ds-border rounded-lg p-10 text-center">
        <p className="text-ds-14 font-medium text-ds-text-primary">Nalog nije pronađen</p>
        <Link href="/batches" className="text-ds-13 text-indigo-600 hover:underline mt-2 inline-block">
          Natrag na listu
        </Link>
      </div>
    );
  }

  const pickedCount = items.filter((i) => i.is_picked).length;
  const progress = items.length > 0 ? Math.round((pickedCount / items.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/batches"
            className="w-8 h-8 rounded border border-ds-border bg-white text-ds-text-secondary hover:text-ds-text-primary flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-ds-17 font-semibold text-ds-text-primary tracking-tight">{batch.batch_code}</h1>
              <span className={cn("px-1.5 py-0.5 text-xs font-medium rounded", statusConfig[batch.status]?.badge || "bg-gray-100 text-gray-600")}>
                {statusConfig[batch.status]?.label || batch.status}
              </span>
              <span className="px-2 py-0.5 rounded text-ds-11 font-medium bg-gray-100 text-gray-600">
                {batch.batch_type}
              </span>
            </div>
            <p className="text-ds-12 text-ds-text-muted mt-0.5">
              {batch.order_count} narudžbi · {batch.total_items} SKU · {batch.total_quantity} kom
            </p>
          </div>
        </div>

        {nextStatus[batch.status] && (
          <button
            onClick={handleTransition}
            disabled={transitioning}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-ds-13 font-medium rounded disabled:opacity-50 transition-colors cursor-pointer shrink-0"
          >
            {transitioning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{transitioning ? "Ažuriranje..." : nextStatusLabels[batch.status]}</span>
            {!transitioning && <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Progress */}
      {batch.status === "in_progress" && (
        <div className="bg-white border border-ds-border rounded-lg px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-ds-13 font-medium text-ds-text-primary">
              Napredak: {pickedCount}/{items.length} stavki
            </span>
            <span className="text-ds-13 font-semibold text-indigo-600">{progress}%</span>
          </div>
          <div className="w-full bg-ds-border-subtle rounded-full h-1.5">
            <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Orders */}
      <div className="bg-white border border-ds-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ds-border-subtle">
          <span className="text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">Narudžbe u nalogu</span>
          <span className="text-ds-12 text-ds-text-muted">{orders.length} narudžbi</span>
        </div>
        <div>
          {orders.map((o, idx) => (
            <div key={o.id} className={cn("flex items-center justify-between px-5 py-3.5 hover:bg-ds-bg transition-colors", idx !== orders.length - 1 && "border-b border-ds-border-subtle")}>
              <div className="flex items-center gap-3.5">
                <div className={cn("w-9 h-9 rounded flex items-center justify-center shrink-0 text-ds-12 font-bold", basketColors[o.basket_label] || "bg-gray-200 text-gray-700")}>
                  {o.basket_label}
                </div>
                <div>
                  <p className="text-ds-13 font-semibold text-ds-text-primary">#{getOrderField(o.orders, "woo_order_id")}</p>
                  <p className="text-ds-11 text-ds-text-muted mt-0.5">{getOrderField(o.orders, "customer_name")}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-ds-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ds-border-subtle">
          <span className="text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">Stavke</span>
          <span className="text-ds-12 text-ds-text-muted">{items.filter(i => i.is_picked).length}/{items.length} skupljeno</span>
        </div>
        <div>
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center justify-between px-5 py-3.5 transition-colors",
                item.is_picked ? "bg-emerald-50/40" : "hover:bg-ds-bg",
                idx !== items.length - 1 && "border-b border-ds-border-subtle"
              )}
            >
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                {batch.status === "in_progress" && (
                  <button
                    onClick={() => toggleItemPicked(item.id, item.is_picked)}
                    className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 cursor-pointer",
                      item.is_picked ? "bg-emerald-500 border-emerald-500 text-white" : "border-ds-text-disabled hover:border-indigo-500"
                    )}
                  >
                    {item.is_picked && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                )}

                <div className="min-w-0">
                  <p className={cn(
                    "text-ds-12 font-medium leading-5 tracking-normal",
                    item.is_picked ? "text-ds-text-muted line-through" : "text-ds-text-primary"
                  )}>
                    {item.product_title || item.sku}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="text-ds-11 text-ds-text-muted">{item.sku}</span>
                    {item.zone_code && (
                      <span className="text-ds-11 text-ds-text-secondary bg-gray-100 px-1.5 py-0.5 rounded">
                        {item.zone_code} / {item.shelf_code}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 pl-4">
                {item.basket_breakdown && Object.entries(item.basket_breakdown).map(([basket, qty]) => (
                  <span key={basket} className={cn("px-1.5 py-0.5 rounded text-xs font-medium", basketLightColors[basket] || "bg-gray-100 text-gray-600")}>
                    {basket}:{qty}
                  </span>
                ))}
                <span className={cn(
                  "text-ds-11 font-semibold tabular-nums",
                  item.is_picked ? "text-emerald-600" : "text-ds-text-primary"
                )}>×{item.total_quantity}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
