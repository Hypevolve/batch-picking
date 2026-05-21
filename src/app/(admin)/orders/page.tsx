"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ShoppingCart, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Order {
  id: number;
  woo_order_id: number;
  customer_name: string;
  status: string;
  woo_status: string;
  synced_at: string;
}

const statusConfig: Record<string, { label: string; badge: string }> = {
  pending_batch: { label: "Čeka nalog",     badge: "bg-gray-100 text-gray-600" },
  batched:       { label: "U nalogu",       badge: "bg-amber-50 text-amber-700" },
  picked:        { label: "Pokupljeno",     badge: "bg-indigo-50 text-indigo-700" },
  packed:        { label: "Spakirano",      badge: "bg-purple-50 text-purple-700" },
  synced:        { label: "Sinkronizirano", badge: "bg-emerald-50 text-emerald-700" },
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = totalCount === 0 ? 0 : (pageSafe - 1) * pageSize + 1;
  const pageEnd = totalCount === 0 ? 0 : pageStart + orders.length - 1;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const start = (pageSafe - 1) * pageSize;
      const end = start + pageSize - 1;
      const { data, count } = await supabase
        .from("orders")
        .select("*", { count: "exact" })
        .order("synced_at", { ascending: false })
        .range(start, end);
      setOrders(data || []);
      setTotalCount(count || 0);
      setLoading(false);
    }
    load();
  }, [pageSafe, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[17px] font-semibold text-[#111318] tracking-tight">Narudžbe</h1>
        <p className="text-[13px] text-[#555d6b] mt-0.5">Pregled narudžbi uvezenih iz WooCommerce.</p>
      </div>

      {loading ? (
        <div className="bg-white border border-[#e4e7eb] rounded-lg p-10 text-center">
          <p className="text-[13px] text-[#8b919e]">Učitavanje...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-[#e4e7eb] rounded-lg p-10 text-center">
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-3">
            <ShoppingCart className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-[14px] font-medium text-[#111318]">Nema narudžbi</p>
          <p className="text-[12px] text-[#8b919e] mt-1 mb-4">Pokrenite WooCommerce sinkronizaciju za uvoz.</p>
          <a href="/batches" className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-medium rounded transition-colors">
            Idi na Batcheve
          </a>
        </div>
      ) : (
        <div className="bg-white border border-[#e4e7eb] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#f0f2f4]">
            <span className="text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">Narudžbe</span>
            <span className="text-[12px] text-[#8b919e]">
              {pageStart}-{pageEnd} / {totalCount}
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0f2f4]">
                <th className="text-left px-5 py-3 text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">WC #</th>
                <th className="text-left px-5 py-3 text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">Kupac</th>
                <th className="text-left px-5 py-3 text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">Sinkronizirano</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => (
                <tr key={order.id} className={cn(
                  "hover:bg-[#f7f8f9] transition-colors",
                  idx !== orders.length - 1 && "border-b border-[#f0f2f4]"
                )}>
                  <td className="px-5 py-3 font-mono text-[13px] font-medium text-[#111318]">#{order.woo_order_id}</td>
                  <td className="px-5 py-3 text-[13px] text-[#111318]">{order.customer_name}</td>
                  <td className="px-5 py-3">
                    <span className={cn("px-2 py-0.5 text-[11px] font-medium rounded",
                      statusConfig[order.status]?.badge || "bg-gray-100 text-gray-600"
                    )}>
                      {statusConfig[order.status]?.label || order.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[12px] text-[#8b919e]">
                    {new Date(order.synced_at).toLocaleDateString("hr-HR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col gap-3 px-5 py-3 border-t border-[#f0f2f4] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[12px] text-[#555d6b]">
              <span>Po stranici</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                  setPage(1);
                }}
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
