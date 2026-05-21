"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Users,
  Plus,
  X,
  Pencil,
  UserCheck,
  UserX,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  active: boolean;
  created_at: string;
}

interface UserForm {
  email: string;
  name: string;
  role: string;
  password: string;
}

const emptyForm: UserForm = { email: "", name: "", role: "picker", password: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    },
    []
  );

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const supabase = createClient();
    const { data } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: true });
    setUsers(data || []);
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(user: User) {
    setEditingId(user.id);
    setForm({
      email: user.email,
      name: user.name,
      role: user.role,
      password: "",
    });
    setShowModal(true);
  }

  async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function handleSave() {
    if (!form.email || !form.name) return;
    if (!editingId && !form.password) return;
    setSaving(true);
    const supabase = createClient();

    if (editingId) {
      const updateData: Record<string, unknown> = {
        name: form.name,
        role: form.role,
        updated_at: new Date().toISOString(),
      };
      if (form.password) {
        updateData.password_hash = await hashPassword(form.password);
      }
      const { error } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", editingId);

      if (error) {
        showToast("Greška pri spremanju: " + error.message, "error");
      } else {
        showToast("Korisnik uspješno ažuriran", "success");
      }
    } else {
      const password_hash = await hashPassword(form.password);
      const { error } = await supabase.from("users").insert({
        email: form.email,
        name: form.name,
        role: form.role,
        password_hash,
        active: true,
      });

      if (error) {
        showToast("Greška pri dodavanju: " + error.message, "error");
      } else {
        showToast("Korisnik uspješno dodan", "success");
      }
    }

    setSaving(false);
    setShowModal(false);
    loadUsers();
  }

  async function toggleActive(user: User) {
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ active: !user.active, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      showToast("Greška pri promjeni statusa: " + error.message, "error");
    } else {
      showToast(
        user.active ? "Korisnički račun deaktiviran" : "Korisnički račun aktiviran",
        "success"
      );
      loadUsers();
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded text-ds-13 font-medium border",
          toast.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
        )}>
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ds-17 font-semibold text-ds-text-primary tracking-tight">Korisnici</h1>
          <p className="text-ds-13 text-ds-text-secondary mt-0.5">Upravljanje računima i ulogama.</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-ds-13 font-medium rounded transition-colors cursor-pointer">
          <Plus className="w-3.5 h-3.5" />
          Novi korisnik
        </button>
      </div>

      {loading ? (
        <div className="bg-white border border-ds-border rounded-lg p-10 text-center">
          <p className="text-ds-13 text-ds-text-muted">Učitavanje...</p>
        </div>
      ) : (
        <div className="bg-white border border-ds-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-ds-border-subtle">
            <span className="text-ds-12 font-medium text-ds-text-muted">Tim</span>
            <span className="text-ds-12 text-ds-text-muted">Ukupno: {users.length}</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-ds-border-subtle">
                <th className="text-left px-5 py-3 text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">Ime</th>
                <th className="text-left px-5 py-3 text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">Email</th>
                <th className="text-left px-5 py-3 text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">Uloga</th>
                <th className="text-left px-5 py-3 text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-ds-11 font-medium text-ds-text-muted uppercase tracking-wide">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, idx) => (
                <tr key={user.id} className={cn("hover:bg-ds-bg transition-colors", idx !== users.length - 1 && "border-b border-ds-border-subtle")}>
                  <td className="px-5 py-3 text-ds-13 font-medium text-ds-text-primary">{user.name}</td>
                  <td className="px-5 py-3 text-ds-13 text-ds-text-secondary">{user.email}</td>
                  <td className="px-5 py-3">
                    <span className={cn("px-1.5 py-0.5 text-xs font-medium rounded",
                      user.role === "admin" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"
                    )}>{user.role === "admin" ? "Administrator" : "Picker"}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("px-1.5 py-0.5 text-xs font-medium rounded",
                      user.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                    )}>{user.active ? "Aktivan" : "Neaktivan"}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(user)} className="p-1.5 text-ds-text-muted hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer" title="Uredi">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggleActive(user)} className={cn("p-1.5 rounded transition-colors cursor-pointer",
                        user.active ? "text-ds-text-muted hover:text-amber-600 hover:bg-amber-50" : "text-ds-text-muted hover:text-emerald-600 hover:bg-emerald-50"
                      )} title={user.active ? "Deaktiviraj" : "Aktiviraj"}>
                        {user.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-ds-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border-subtle">
              <h3 className="text-ds-15 font-semibold text-ds-text-primary">{editingId ? "Uredi korisnika" : "Novi korisnik"}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-ds-text-muted hover:text-ds-text-primary rounded transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-ds-12 font-medium text-ds-text-primary mb-1.5">Ime i prezime</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-ds-border rounded bg-white text-ds-14 text-ds-text-primary placeholder:text-ds-text-muted focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                  placeholder="npr. Ivan Horvat" />
              </div>
              <div>
                <label className="block text-ds-12 font-medium text-ds-text-primary mb-1.5">Email adresa</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2.5 border border-ds-border rounded bg-white text-ds-14 text-ds-text-primary placeholder:text-ds-text-muted focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors disabled:bg-gray-50 disabled:text-ds-text-muted"
                  placeholder="npr. ivan@libar.hr" disabled={!!editingId} />
              </div>
              <div>
                <label className="block text-ds-12 font-medium text-ds-text-primary mb-1.5">Uloga</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2.5 border border-ds-border rounded bg-white text-ds-14 text-ds-text-primary focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors cursor-pointer">
                  <option value="picker">Picker (Skladištar)</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div>
                <label className="block text-ds-12 font-medium text-ds-text-primary mb-1.5">{editingId ? "Nova lozinka (prazno = bez promjene)" : "Lozinka"}</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2.5 border border-ds-border rounded bg-white text-ds-14 text-ds-text-primary placeholder:text-ds-text-muted focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                  placeholder={editingId ? "Ostavite prazno ako ne mijenjate" : "Unesite lozinku"} required={!editingId} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ds-border-subtle">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-ds-13 font-medium text-ds-text-secondary hover:text-ds-text-primary rounded hover:bg-gray-100 transition-colors cursor-pointer">Odustani</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.email || (!editingId && !form.password)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-ds-13 font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
                {saving ? "Spremanje..." : editingId ? "Spremi" : "Dodaj"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
