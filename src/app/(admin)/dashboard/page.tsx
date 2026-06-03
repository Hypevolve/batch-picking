"use client";

import {
  RefreshCw,
  Layers,
  MapPin,
  ShoppingCart,
  ArrowRight,
  CheckCircle,
  Package,
  AlertCircle,
  Clock,
  User,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

interface DashStats {
  orders: number;
  batches: number;
  picked: number;
  packed: number;
}

interface ActivityLogItem {
  id: number;
  user_name: string;
  action: string;
  details: string;
  time_label: string;
  type: "system" | "operator";
  status: "success" | "warning" | "info" | "neutral";
}

function formatTimeLabel(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "upravo sad";
  if (minutes < 60) return `prije ${minutes} min`;
  if (hours < 24) {
    if (hours === 1) return "prije 1 sat";
    if (hours < 5) return `prije ${hours} sata`;
    return `prije ${hours} sati`;
  }
  if (days === 1) return "jučer";
  return `prije ${days} dana`;
}

function mapDBLogToActivity(log: any): ActivityLogItem {
  const time_label = formatTimeLabel(log.created_at);
  const user_name = log.users?.name || "Sustav";

  let actionText = log.action;
  let detailsText = "";
  let type: "system" | "operator" = log.entity_type === "system" ? "system" : "operator";
  let status: "success" | "warning" | "info" | "neutral" = "neutral";

  if (log.action === "status_changed" && log.details) {
    const to = log.details.to;
    const batchNum = `Batch B-${String(log.entity_id).padStart(3, "0")}`;
    type = "operator";
    if (to === "in_progress") { actionText = "Započeo skupljanje"; detailsText = batchNum; status = "info"; }
    else if (to === "picked") { actionText = "Dovršeno skupljanje"; detailsText = `${batchNum} uspješno skupljen`; status = "success"; }
    else if (to === "packed") { actionText = "Dovršeno pakiranje"; detailsText = `${batchNum} spakiran`; status = "success"; }
    else if (to === "synced") { actionText = "Sinkronizirano"; detailsText = `${batchNum} sinkroniziran`; status = "success"; type = "system"; }
    else { actionText = `Status: ${to}`; detailsText = batchNum; }
  } else if (log.action === "woocommerce_sync" && log.details) {
    actionText = "WooCommerce sync";
    type = "system"; status = "success";
    const synced = log.details.synced || 0;
    detailsText = log.details.method === "webhook"
      ? `Webhook #${log.details.order_id}`
      : `Uvezeno ${synced} narudžbi`;
  } else if (log.action === "batches_generated" && log.details) {
    actionText = "Generirani batchevi";
    type = "system";
    detailsText = log.details.message || `${log.details.created_count} novih`;
  } else {
    detailsText = typeof log.details === "string" ? log.details : (log.details?.message || "");
    type = log.user_id ? "operator" : "system";
  }

  return { id: log.id, user_name, action: actionText, details: detailsText, time_label, type, status };
}

const metricCards = [
  { key: "orders" as const, label: "Narudžbe", sub: "Uvezeno iz WooCommerce", icon: ShoppingCart, topBorder: "border-t-2 border-t-blue-500", iconBg: "bg-blue-50", iconColor: "text-blue-600" },
  { key: "batches" as const, label: "Batchevi", sub: "Ukupno generiranih naloga", icon: Layers, topBorder: "border-t-2 border-t-indigo-500", iconBg: "bg-indigo-50", iconColor: "text-indigo-600" },
  { key: "picked" as const, label: "Skupljeno", sub: "Završeno skupljanje", icon: CheckCircle, topBorder: "border-t-2 border-t-emerald-500", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  { key: "packed" as const, label: "Spakirano", sub: "Spremno za otpremu", icon: Package, topBorder: "border-t-2 border-t-amber-500", iconBg: "bg-amber-50", iconColor: "text-amber-600" },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashStats>({ orders: 0, batches: 0, picked: 0, packed: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activities, setActivities] = useState<ActivityLogItem[]>([]);

  const loadStats = async () => {
    const supabase = createClient();
    const [o, b, p, pk] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase.from("batches").select("id", { count: "exact", head: true }),
      supabase.from("batches").select("id", { count: "exact", head: true }).eq("status", "picked"),
      supabase.from("batches").select("id", { count: "exact", head: true }).eq("status", "packed"),
    ]);
    setStats({ orders: o.count || 0, batches: b.count || 0, picked: p.count || 0, packed: pk.count || 0 });
  };

  const loadActivities = async () => {
    const supabase = createClient();
    const { data: logs } = await supabase
      .from("activity_logs")
      .select("id, user_id, entity_type, entity_id, action, details, created_at, users(name)")
      .order("created_at", { ascending: false })
      .limit(12);
    if (logs) setActivities(logs.map(mapDBLogToActivity));
  };

  useEffect(() => {
    (async () => {
      await Promise.all([loadStats(), loadActivities()]);
      setLoading(false);
    })();
  }, []);

  const handleSync = async () => {
    if (syncing || resetting) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/trpc/orders.sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const result = await res.json();
      const data = result?.result?.data;
      setSyncResult({ success: true, message: `${data?.synced || 0} novih, ${data?.skipped || 0} preskočenih` });
      await Promise.all([loadStats(), loadActivities()]);
    } catch {
      setSyncResult({ success: false, message: "Sinkronizacija neuspješna." });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 4000);
    }
  };

  const handleResetAndSync = async () => {
    if (syncing || resetting) return;
    if (!confirm("Ovo će obrisati SVE batcheve, narudžbe i stavke iz baze, te pokrenuti novu sinkronizaciju iz WooCommercea. Jeste li sigurni?")) return;
    setResetting(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/trpc/orders.resetAndSync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const result = await res.json();
      const data = result?.result?.data;
      setSyncResult({ success: true, message: `Baza očišćena. Uvezeno ${data?.synced || 0} narudžbi.` });
      await Promise.all([loadStats(), loadActivities()]);
    } catch {
      setSyncResult({ success: false, message: "Reset i sinkronizacija neuspješni." });
    } finally {
      setResetting(false);
      setTimeout(() => setSyncResult(null), 4000);
    }
  };

  const val = (v: number) => (loading ? "–" : String(v));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-ds-17 font-semibold text-ds-text-primary tracking-tight">Dashboard</h1>
        <p className="text-ds-13 text-ds-text-secondary mt-0.5">Pregled stanja skladišta i narudžbi.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((m) => (
          <div key={m.key} className={cn("bg-white border border-ds-border rounded-lg px-5 py-4", m.topBorder)}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">{m.label}</span>
              <div className={cn("w-7 h-7 rounded flex items-center justify-center", m.iconBg)}>
                <m.icon className={cn("w-3.5 h-3.5", m.iconColor)} />
              </div>
            </div>
            <p className="text-ds-36 font-semibold text-ds-text-primary tracking-tight leading-none">{val(stats[m.key])}</p>
            <p className="text-ds-11 text-ds-text-muted mt-2">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Two-column: Sync + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: Sync + Quick actions */}
        <div className="lg:col-span-3 space-y-5">
          {/* Sync Panel */}
          <div className="bg-white border border-ds-border rounded-lg p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-ds-13 font-semibold text-ds-text-primary">WooCommerce sinkronizacija</h3>
                <p className="text-ds-12 text-ds-text-muted mt-0.5">Povucite nove narudžbe iz web trgovine.</p>
                {syncResult && (
                  <div className={cn(
                    "mt-3 px-3 py-2 rounded text-ds-12 font-medium flex items-center gap-1.5",
                    syncResult.success ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
                  )}>
                    {syncResult.success ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {syncResult.message}
                  </div>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  onClick={handleSync}
                  disabled={syncing || resetting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-ds-13 font-medium transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                  {syncing ? "Sync..." : "Sinkroniziraj"}
                </button>
                <button
                  onClick={handleResetAndSync}
                  disabled={syncing || resetting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-700 rounded text-ds-13 font-medium transition-colors disabled:opacity-50 cursor-pointer hover:bg-red-50"
                >
                  <Trash2 className={cn("w-3.5 h-3.5", resetting && "animate-spin")} />
                  {resetting ? "Čišćenje..." : "Reset & Sync"}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { href: "/batches", label: "Batchevi", desc: "Generiraj i pregledaj naloge", icon: Layers },
              { href: "/locations", label: "Lokacije", desc: "Skladišne zone i police", icon: MapPin },
              { href: "/orders", label: "Narudžbe", desc: "Pregled svih narudžbi", icon: ShoppingCart },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="group bg-white border border-ds-border rounded-lg p-4 hover:border-indigo-300 transition-colors"
              >
                <a.icon className="w-5 h-5 text-ds-text-muted mb-3 group-hover:text-indigo-600 transition-colors" />
                <p className="text-ds-13 font-semibold text-ds-text-primary group-hover:text-indigo-600 transition-colors">{a.label}</p>
                <p className="text-ds-11 text-ds-text-muted mt-0.5">{a.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Right: Activity Log */}
        <div className="lg:col-span-2 bg-white border border-ds-border rounded-lg p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-ds-13 font-semibold text-ds-text-primary">Aktivnost</h3>
            <span className="text-ds-11 text-ds-text-muted">Zadnja 24h</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[340px] space-y-3">
            {activities.length === 0 ? (
              <p className="text-ds-12 text-ds-text-muted text-center py-8">Nema zapisa.</p>
            ) : (
              activities.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className={cn(
                    "w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5",
                    item.status === "success" ? "bg-emerald-50 text-emerald-600"
                      : item.status === "info" ? "bg-blue-50 text-blue-600"
                      : item.status === "warning" ? "bg-amber-50 text-amber-600"
                      : "bg-gray-100 text-ds-text-muted"
                  )}>
                    {item.type === "system" ? <Package className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-ds-12 font-medium text-ds-text-primary truncate">{item.action}</p>
                      <span className="text-ds-10 text-ds-text-muted shrink-0 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {item.time_label}
                      </span>
                    </div>
                    {item.details && (
                      <p className="text-ds-11 text-ds-text-muted mt-0.5 truncate">{item.details}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
