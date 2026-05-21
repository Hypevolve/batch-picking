"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  MapPin,
  Plus,
  Upload,
  Trash2,
  X,
  Pencil,
  Search,
  FileDown,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductLocation {
  id: number;
  sku: string;
  zone_code: string;
  shelf_code: string;
  route_position: number;
}

interface LocationForm {
  sku: string;
  zone_code: string;
  shelf_code: string;
  route_position: number;
}

const emptyForm: LocationForm = {
  sku: "",
  zone_code: "",
  shelf_code: "",
  route_position: 0,
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export default function LocationsPage() {
  const [locations, setLocations] = useState<ProductLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [showModal, setShowModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [csvResult, setCsvResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    },
    []
  );

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadLocations() {
    const supabase = createClient();
    const { data } = await supabase
      .from("product_locations")
      .select("*")
      .order("route_position", { ascending: true });
    setLocations(data || []);
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(loc: ProductLocation) {
    setEditingId(loc.id);
    setForm({
      sku: loc.sku,
      zone_code: loc.zone_code,
      shelf_code: loc.shelf_code,
      route_position: loc.route_position,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.sku || !form.zone_code || !form.shelf_code) return;
    setSaving(true);
    const supabase = createClient();

    if (editingId) {
      const { error } = await supabase
        .from("product_locations")
        .update({
          sku: form.sku,
          zone_code: form.zone_code,
          shelf_code: form.shelf_code,
          route_position: form.route_position,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingId);

      if (error) {
        showToast("Greška pri ažuriranju: " + error.message, "error");
      } else {
        showToast("Lokacija uspješno ažurirana", "success");
      }
    } else {
      const { error } = await supabase.from("product_locations").insert({
        sku: form.sku,
        zone_code: form.zone_code,
        shelf_code: form.shelf_code,
        route_position: form.route_position,
      });

      if (error) {
        showToast("Greška pri dodavanju: " + error.message, "error");
      } else {
        showToast("Nova lokacija dodana", "success");
      }
    }

    setSaving(false);
    setShowModal(false);
    loadLocations();
  }

  async function handleDelete(id: number) {
    if (!confirm("Jeste li sigurni da želite obrisati ovu lokaciju?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("product_locations")
      .delete()
      .eq("id", id);

    if (error) {
      showToast("Greška pri brisanju: " + error.message, "error");
    } else {
      showToast("Lokacija uspješno obrisana", "success");
      loadLocations();
    }
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      showToast("CSV datoteka je prazna ili nema zaglavlje", "error");
      return;
    }

    const header = lines[0].toLowerCase().split(/[,;\t]/);
    const skuIdx = header.findIndex((h) => h.includes("sku"));
    const zoneIdx = header.findIndex(
      (h) => h.includes("zon") || h.includes("zone")
    );
    const shelfIdx = header.findIndex(
      (h) => h.includes("polic") || h.includes("shelf") || h.includes("regal")
    );
    const posIdx = header.findIndex(
      (h) => h.includes("poz") || h.includes("position") || h.includes("route")
    );

    if (skuIdx === -1 || zoneIdx === -1 || shelfIdx === -1) {
      showToast(
        "CSV mora sadržavati stupce: SKU, Zona, Polica. Pronađeno: " +
          header.join(", "),
        "error"
      );
      return;
    }

    const supabase = createClient();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,;\t]/);
      const sku = cols[skuIdx]?.trim();
      const zone = cols[zoneIdx]?.trim();
      const shelf = cols[shelfIdx]?.trim();
      const pos = posIdx >= 0 ? parseInt(cols[posIdx]?.trim()) || 0 : i;

      if (!sku || !zone || !shelf) {
        errors.push(`Red ${i + 1}: nedostaju podaci`);
        continue;
      }

      const { data: existing } = await supabase
        .from("product_locations")
        .select("id")
        .eq("sku", sku)
        .limit(1)
        .single();

      if (existing) {
        await supabase
          .from("product_locations")
          .update({
            zone_code: zone,
            shelf_code: shelf,
            route_position: pos,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        updated++;
      } else {
        const { error } = await supabase.from("product_locations").insert({
          sku,
          zone_code: zone,
          shelf_code: shelf,
          route_position: pos,
        });
        if (error) {
          errors.push(`Red ${i + 1} (${sku}): ${error.message}`);
        } else {
          created++;
        }
      }
    }

    setCsvResult({ created, updated, errors });
    setShowCsvModal(true);
    loadLocations();

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function exportCsv() {
    const header = "SKU,Zona,Polica,Pozicija";
    const rows = locations.map(
      (l) => `${l.sku},${l.zone_code},${l.shelf_code},${l.route_position}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lokacije.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = locations.filter(
    (l) =>
      l.sku.toLowerCase().includes(search.toLowerCase()) ||
      l.zone_code.toLowerCase().includes(search.toLowerCase()) ||
      l.shelf_code.toLowerCase().includes(search.toLowerCase())
  );
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = totalItems === 0 ? 0 : (pageSafe - 1) * pageSize + 1;
  const pageEnd = totalItems === 0 ? 0 : Math.min(pageSafe * pageSize, totalItems);
  const paginated = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="space-y-6">
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded text-[13px] font-medium border",
          toast.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
        )}>
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-semibold text-[#111318] tracking-tight">SKU Lokacije</h1>
          <p className="text-[13px] text-[#555d6b] mt-0.5">Skladišne lokacije i raspored prolaza.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="inline-flex items-center justify-center p-2 bg-white border border-[#e4e7eb] text-[#555d6b] rounded hover:bg-gray-50 transition-colors cursor-pointer" title="Izvezi CSV">
            <FileDown className="w-4 h-4" />
          </button>
          <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-[#e4e7eb] text-[#111318] text-[13px] font-medium rounded hover:bg-gray-50 transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-[#8b919e]" />
            CSV Uvoz
            <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvImport} />
          </label>
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-medium rounded transition-colors cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            Dodaj
          </button>
        </div>
      </div>

      {locations.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b919e]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži po SKU, zoni ili polici..."
            className="w-full pl-9 pr-4 py-2.5 border border-[#e4e7eb] rounded bg-white text-[14px] text-[#111318] placeholder:text-[#8b919e] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
          />
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-[#e4e7eb] rounded-lg p-10 text-center">
          <p className="text-[13px] text-[#8b919e]">Učitavanje...</p>
        </div>
      ) : locations.length === 0 ? (
        <div className="bg-white border border-[#e4e7eb] rounded-lg p-10 text-center">
          <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mx-auto mb-3">
            <MapPin className="w-6 h-6 text-indigo-500" />
          </div>
          <p className="text-[14px] font-medium text-[#111318]">Nema lokacija</p>
          <p className="text-[12px] text-[#8b919e] mt-1 mb-4">Dodajte lokacije ručno ili uvezite CSV datoteku.</p>
          <button onClick={openAdd} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-medium rounded transition-colors cursor-pointer">
            Dodaj prvu lokaciju
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#e4e7eb] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#f0f2f4]">
            <span className="text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">Lokacije</span>
            <span className="text-[12px] text-[#8b919e]">
              {pageStart}-{pageEnd} / {filtered.length} (ukupno {locations.length})
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0f2f4]">
                <th className="text-left px-5 py-3 text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">SKU</th>
                <th className="text-left px-5 py-3 text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">Zona</th>
                <th className="text-left px-5 py-3 text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">Polica</th>
                <th className="text-left px-5 py-3 text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">Pozicija</th>
                <th className="text-right px-5 py-3 text-[11px] font-medium text-[#8b919e] uppercase tracking-wide">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((loc, idx) => (
                <tr key={loc.id} className={cn("hover:bg-[#f7f8f9] transition-colors", idx !== paginated.length - 1 && "border-b border-[#f0f2f4]")}>
                  <td className="px-5 py-3 font-mono text-[12px] font-medium text-[#111318]">{loc.sku}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-indigo-50 text-indigo-700">{loc.zone_code}</span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-[#111318]">{loc.shelf_code}</td>
                  <td className="px-5 py-3">
                    <span className="text-[12px] font-mono text-[#555d6b]">{loc.route_position}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(loc)} className="p-1.5 text-[#8b919e] hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer" title="Uredi">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(loc.id)} className="p-1.5 text-[#8b919e] hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer" title="Obriši">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-[#e4e7eb] rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f2f4]">
              <h3 className="text-[15px] font-semibold text-[#111318]">{editingId ? "Uredi lokaciju" : "Nova lokacija"}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-[#8b919e] hover:text-[#111318] rounded transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#111318] mb-1.5">SKU</label>
                <input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#e4e7eb] rounded bg-white text-[14px] text-[#111318] placeholder:text-[#8b919e] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors disabled:bg-gray-50 disabled:text-[#8b919e]"
                  placeholder="npr. 978-953-123-456-7" disabled={!!editingId} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#111318] mb-1.5">Zona</label>
                  <input type="text" value={form.zone_code} onChange={(e) => setForm({ ...form, zone_code: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#e4e7eb] rounded bg-white text-[14px] text-[#111318] placeholder:text-[#8b919e] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                    placeholder="npr. A" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#111318] mb-1.5">Polica</label>
                  <input type="text" value={form.shelf_code} onChange={(e) => setForm({ ...form, shelf_code: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[#e4e7eb] rounded bg-white text-[14px] text-[#111318] placeholder:text-[#8b919e] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                    placeholder="npr. A3-2" />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#111318] mb-1.5">Pozicija u ruti</label>
                <input type="number" value={form.route_position} onChange={(e) => setForm({ ...form, route_position: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 border border-[#e4e7eb] rounded bg-white text-[14px] text-[#111318] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors" min={0} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#f0f2f4]">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] font-medium text-[#555d6b] hover:text-[#111318] rounded hover:bg-gray-100 transition-colors cursor-pointer">Odustani</button>
              <button onClick={handleSave} disabled={saving || !form.sku || !form.zone_code || !form.shelf_code}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
                {saving ? "Spremanje..." : editingId ? "Spremi" : "Dodaj"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCsvModal && csvResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-[#e4e7eb] rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f2f4]">
              <h3 className="text-[15px] font-semibold text-[#111318]">Rezultat uvoza</h3>
              <button onClick={() => setShowCsvModal(false)} className="p-1.5 text-[#8b919e] hover:text-[#111318] rounded transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#111318]">{csvResult.created} novih, {csvResult.updated} ažuriranih</p>
                  <p className="text-[12px] text-[#8b919e]">Ukupno: {csvResult.created + csvResult.updated} lokacija</p>
                </div>
              </div>
              {csvResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-[12px] font-semibold text-red-700 mb-1 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Greške ({csvResult.errors.length})</p>
                  <ul className="text-[11px] text-red-600 space-y-1 overflow-y-auto max-h-32">
                    {csvResult.errors.slice(0, 10).map((err, i) => <li key={i} className="list-disc list-inside">{err}</li>)}
                    {csvResult.errors.length > 10 && <li className="font-medium">... i još {csvResult.errors.length - 10}</li>}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-[#f0f2f4]">
              <button onClick={() => setShowCsvModal(false)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-medium rounded transition-colors cursor-pointer">U redu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
