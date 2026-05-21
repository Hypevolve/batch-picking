"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Layers, Plus, ChevronRight, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
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
          "fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded text-[13px] font-medium border",
          toast.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
        )}>
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-semibold text-[#111318] tracking-tight">Batchevi</h1>
          <p className="text-[13px] text-[#555d6b] mt-0.5">Grupni picking nalozi.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncOrders}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-[#e4e7eb] text-[#111318] text-[13px] font-medium rounded hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-[#8b919e]", syncing && "animate-spin")} />
            {syncing ? "Sync..." : "Sync"}
          </button>
          <button
            onClick={generateBatches}
            disabled={generating}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-medium rounded disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {generating ? "Generiranje..." : "Generiraj"}
          </button>
        </div>
      </div>

      {/* Pipeline status strip */}
      {!loading && batches.length > 0 && (
        <div className="bg-white border border-[#e4e7eb] rounded-lg">
          <div className="flex">
            {pipelineStages.map((stage, idx) => {
              const cfg = statusConfig[stage.key];
              const count = pipelineCounts[stage.key] ?? 0;
              const isActive = activeFilter === stage.key;
              return (
                <button
                  key={stage.key}
                  onClick={() => setActiveFilter(isActive ? null : stage.key)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 py-3 px-2 text-center transition-colors cursor-pointer border-b-2",
                    idx !== pipelineStages.length - 1 && "border-r border-[#f0f2f4]",
                    isActive ? "border-b-indigo-500 bg-indigo-50/60" : "border-b-transparent hover:bg-[#f7f8f9]"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dot)} />
                    <span className={cn("text-[11px] font-medium", isActive ? "text-indigo-700" : "text-[#8b919e]")}>{stage.label}</span>
                  </div>
                  <span className={cn("text-[18px] font-semibold leading-none", isActive ? "text-indigo-700" : count > 0 ? "text-[#111318]" : "text-[#c5c9d0]")}>{count}</span>
                </button>
              );
            })}
          </div>
          {activeFilter && (
            <div className="px-4 py-2 border-t border-[#f0f2f4] flex items-center justify-between">
              <span className="text-[12px] text-[#555d6b]">Filter: <span className="font-medium">{statusConfig[activeFilter]?.label}</span> ({filtered.length})</span>
              <button onClick={() => setActiveFilter(null)} className="text-[11px] text-indigo-600 hover:underline cursor-pointer">Poništi filter</button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white border border-[#e4e7eb] rounded-lg p-10 text-center">
          <p className="text-[13px] text-[#8b919e]">Učitavanje...</p>
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white border border-[#e4e7eb] rounded-lg p-10 text-center">
          <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Layers className="w-6 h-6 text-indigo-500" />
          </div>
          <p className="text-[14px] font-medium text-[#111318]">Nema naloga</p>
          <p className="text-[12px] text-[#8b919e] mt-1 mb-4">Sinkronizirajte narudžbe i generirajte batcheve.</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={syncOrders} disabled={syncing} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#e4e7eb] text-[#111318] text-[13px] font-medium rounded hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer">
              <RefreshCw className={cn("w-3.5 h-3.5 text-[#8b919e]", syncing && "animate-spin")} />
              Sync narudžbi
            </button>
            <button onClick={generateBatches} disabled={generating} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-medium rounded disabled:opacity-50 transition-colors cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              Generiraj batcheve
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#e4e7eb] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#f0f2f4]">
            <span className="text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">Nalog</span>
            <span className="text-[12px] text-[#8b919e]">
              {pageStart}-{pageEnd} / {totalItems}
            </span>
          </div>
          {paginated.map((batch, idx) => (
            <Link
              key={batch.id}
              href={`/batches/${batch.id}`}
              className={cn(
                "flex items-center justify-between px-5 py-3.5 hover:bg-[#f7f8f9] transition-colors group",
                idx !== paginated.length - 1 && "border-b border-[#f0f2f4]"
              )}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 bg-indigo-50 rounded flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#111318]">{batch.batch_code}</p>
                  <p className="text-[11px] text-[#8b919e] mt-0.5">
                    {batch.order_count} narudžbi · {batch.total_items} SKU · {batch.total_quantity} kom
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("px-2 py-0.5 text-[11px] font-medium rounded", statusConfig[batch.status]?.badge || "bg-gray-100 text-gray-600")}>
                  {statusConfig[batch.status]?.label || batch.status}
                </span>
                <ChevronRight className="w-4 h-4 text-[#c5c9d0] group-hover:text-[#8b919e] transition-colors" />
              </div>
            </Link>
          ))}
          <div className="flex flex-col gap-3 px-5 py-3 border-t border-[#f0f2f4] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[12px] text-[#555d6b]">
              <span>Po stranici</span>
              <select
                value={pageSize}
                onChange={(e) =>
                  setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
                }
                className="border border-[#e4e7eb] rounded px-2 py-1 bg-white text-[12px] text-[#111318] focus:border-indigo-500 outline-none"
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
                className="px-3 py-1.5 text-[12px] font-medium border border-[#e4e7eb] rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Prethodna
              </button>
              <span className="text-[12px] text-[#555d6b] min-w-[96px] text-center">
                Stranica {pageSafe} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="px-3 py-1.5 text-[12px] font-medium border border-[#e4e7eb] rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
