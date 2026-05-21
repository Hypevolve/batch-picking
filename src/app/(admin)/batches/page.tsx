"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Layers, Plus, ChevronRight, RefreshCw, CheckCircle2, AlertCircle, Clock3, Play, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Batch {
  id: number;
  batch_code: string;
  batch_type: string;
  status: string;
  order_count: number;
  total_items: number;
  total_quantity: number;
  similarity_score: number;
  generated_at: string;
}

const statusConfig: Record<string, { label: string; badge: string; dot: string }> = {
  draft:       { label: "Nacrt",         badge: "bg-gray-100 text-gray-600",    dot: "bg-gray-400" },
  ready:       { label: "Spreman",       badge: "bg-amber-50 text-amber-700",   dot: "bg-amber-500" },
  in_progress: { label: "U tijeku",      badge: "bg-blue-50 text-blue-700",     dot: "bg-blue-500" },
  picked:      { label: "Pokupljen",     badge: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  packed:      { label: "Spakiran",      badge: "bg-purple-50 text-purple-700", dot: "bg-purple-500" },
  synced:      { label: "Sinkroniziran", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
};

const pipelineStages = [
  { key: "ready",       label: "Spremni" },
  { key: "in_progress", label: "U tijeku" },
  { key: "picked",      label: "Pokupljeni" },
  { key: "packed",      label: "Spakirani" },
  { key: "synced",      label: "Sinkronizirani" },
];

const pipelineCardConfig: Record<string, { topBorder: string; iconBg: string; iconColor: string; subLabel: string; icon: LucideIcon }> = {
  ready: { topBorder: "border-t-2 border-t-amber-500", iconBg: "bg-amber-50", iconColor: "text-amber-600", subLabel: "Spremni za picking", icon: Clock3 },
  in_progress: { topBorder: "border-t-2 border-t-blue-500", iconBg: "bg-blue-50", iconColor: "text-blue-600", subLabel: "Aktivno skupljanje", icon: Play },
  picked: { topBorder: "border-t-2 border-t-indigo-500", iconBg: "bg-indigo-50", iconColor: "text-indigo-600", subLabel: "Skupljanje završeno", icon: CheckCircle2 },
  packed: { topBorder: "border-t-2 border-t-purple-500", iconBg: "bg-purple-50", iconColor: "text-purple-600", subLabel: "Spremno za otpremu", icon: Package },
  synced: { topBorder: "border-t-2 border-t-emerald-500", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", subLabel: "Sinkronizirano", icon: RefreshCw },
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    loadBatches();
  }, []);

  async function loadBatches() {
    const supabase = createClient();
    const { data } = await supabase
      .from("batches")
      .select("*")
      .order("generated_at", { ascending: false });
    setBatches(data || []);
    setLoading(false);
  }

  const pipelineCounts = pipelineStages.reduce((acc, s) => {
    acc[s.key] = batches.filter((b) => b.status === s.key).length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = activeFilter ? batches.filter((b) => b.status === activeFilter) : batches;
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = totalItems === 0 ? 0 : (pageSafe - 1) * pageSize + 1;
  const pageEnd = totalItems === 0 ? 0 : Math.min(pageSafe * pageSize, totalItems);
  const paginated = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  async function syncOrders() {
    setSyncing(true);
    try {
      const res = await fetch("/api/trpc/orders.sync", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({}) 
      });
      const result = await res.json();
      const data = result?.result?.data;
      if (data?.errors && data.errors.length > 0) {
        showToast(`Sinkronizacija završena s ${data.errors.length} pogrešaka. ${data.synced || 0} novih, ${data.skipped || 0} preskočenih.`, "error");
      } else {
        showToast(`Sinkronizacija uspješna! ${data?.synced || 0} novih, ${data?.skipped || 0} preskočenih.`, "success");
      }
    } catch (err) {
      showToast("Sinkronizacija neuspješna. Provjerite WooCommerce postavke.", "error");
    }
    setSyncing(false);
  }

  async function generateBatches() {
    setGenerating(true);
    try {
      const res = await fetch("/api/trpc/batches.generate", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({}) 
      });
      const result = await res.json();
      const count = result?.result?.data?.created || 0;
      showToast(`Generirano ${count} novih naloga za picking.`, "success");
      loadBatches();
    } catch (err) {
      showToast("Generiranje neuspješno.", "error");
    }
    setGenerating(false);
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded text-ds-13 font-medium border",
          toast.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
        )}>
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ds-17 font-semibold text-ds-text-primary tracking-tight">Batchevi</h1>
          <p className="text-ds-13 text-ds-text-secondary mt-0.5">Grupni picking nalozi.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncOrders}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-ds-border text-ds-text-primary text-ds-13 font-medium rounded hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-ds-text-muted", syncing && "animate-spin")} />
            {syncing ? "Sync..." : "Sync"}
          </button>
          <button
            onClick={generateBatches}
            disabled={generating}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-ds-13 font-medium rounded disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {generating ? "Generiranje..." : "Generiraj"}
          </button>
        </div>
      </div>

      {/* Pipeline status cards */}
      {!loading && batches.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {pipelineStages.map((stage) => {
              const card = pipelineCardConfig[stage.key];
              const CardIcon = card.icon;
              const count = pipelineCounts[stage.key] ?? 0;
              const isActive = activeFilter === stage.key;
              const toggleFilter = () => setActiveFilter(isActive ? null : stage.key);
              return (
                <div
                  key={stage.key}
                  role="button"
                  tabIndex={0}
                  onClick={toggleFilter}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleFilter();
                    }
                  }}
                  className={cn(
                    "bg-white border border-ds-border rounded-lg px-5 py-4 text-left transition-colors cursor-pointer",
                    card.topBorder,
                    isActive ? "border-indigo-300 bg-ds-bg/40" : "hover:border-indigo-300"
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">
                      {stage.label}
                    </span>
                    <div className={cn("w-7 h-7 rounded flex items-center justify-center", card.iconBg)}>
                      <CardIcon className={cn("w-3.5 h-3.5", card.iconColor)} />
                    </div>
                  </div>
                  <p className="text-ds-36 font-semibold text-ds-text-primary tracking-tight leading-none">
                    {count}
                  </p>
                  <p className="text-ds-11 text-ds-text-muted mt-2">{card.subLabel}</p>
                </div>
              );
            })}
          </div>
          {activeFilter && (
            <div className="px-4 py-2 border border-ds-border-subtle rounded-lg bg-white flex items-center justify-between">
              <span className="text-ds-12 text-ds-text-secondary">Filter: <span className="font-medium">{statusConfig[activeFilter]?.label}</span> ({filtered.length})</span>
              <button onClick={() => setActiveFilter(null)} className="text-ds-11 text-indigo-600 hover:underline cursor-pointer">Poništi filter</button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white border border-ds-border rounded-lg p-10 text-center">
          <p className="text-ds-13 text-ds-text-muted">Učitavanje...</p>
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white border border-ds-border rounded-lg p-10 text-center">
          <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Layers className="w-6 h-6 text-indigo-500" />
          </div>
          <p className="text-ds-14 font-medium text-ds-text-primary">Nema naloga</p>
          <p className="text-ds-12 text-ds-text-muted mt-1 mb-4">Sinkronizirajte narudžbe i generirajte batcheve.</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={syncOrders} disabled={syncing} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-ds-border text-ds-text-primary text-ds-13 font-medium rounded hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer">
              <RefreshCw className={cn("w-3.5 h-3.5 text-ds-text-muted", syncing && "animate-spin")} />
              Sync narudžbi
            </button>
            <button onClick={generateBatches} disabled={generating} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-ds-13 font-medium rounded disabled:opacity-50 transition-colors cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              Generiraj batcheve
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-ds-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-ds-border-subtle">
            <span className="text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">Nalog</span>
            <span className="text-ds-12 text-ds-text-muted">
              {pageStart}-{pageEnd} / {totalItems}
            </span>
          </div>
          {paginated.map((batch, idx) => (
            <Link
              key={batch.id}
              href={`/batches/${batch.id}`}
              className={cn(
                "flex items-center justify-between px-5 py-3.5 hover:bg-ds-bg transition-colors group",
                idx !== paginated.length - 1 && "border-b border-ds-border-subtle"
              )}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 bg-indigo-50 rounded flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-ds-13 font-semibold text-ds-text-primary">{batch.batch_code}</p>
                  <p className="text-ds-11 text-ds-text-muted mt-0.5">
                    {batch.order_count} narudžbi · {batch.total_items} SKU · {batch.total_quantity} kom
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("px-1.5 py-0.5 text-xs font-medium rounded", statusConfig[batch.status]?.badge || "bg-gray-100 text-gray-600")}>
                  {statusConfig[batch.status]?.label || batch.status}
                </span>
                <ChevronRight className="w-4 h-4 text-ds-text-disabled group-hover:text-ds-text-muted transition-colors" />
              </div>
            </Link>
          ))}
          <div className="flex flex-col gap-3 px-5 py-3 border-t border-ds-border-subtle sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-ds-12 text-ds-text-secondary">
              <span>Po stranici</span>
              <select
                value={pageSize}
                onChange={(e) =>
                  setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
                }
                className="border border-ds-border rounded px-2 py-1 bg-white text-ds-12 text-ds-text-primary focus:border-indigo-500 outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                className="px-3 py-1.5 text-ds-12 font-medium border border-ds-border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Prethodna
              </button>
              <span className="text-ds-12 text-ds-text-secondary min-w-[96px] text-center">
                Stranica {pageSafe} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="px-3 py-1.5 text-ds-12 font-medium border border-ds-border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Sljedeća
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
