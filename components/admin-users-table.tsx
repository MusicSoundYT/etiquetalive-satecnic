"use client";

import { Fragment, useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  last_name: string | null;
  tenant_id: string | null;
  is_admin: boolean;
  tenant_status: string;
  total_consumed_cents: number;
  balance: { current_tier: number; balance_cents: number; is_blocked: boolean; is_demo: boolean } | null;
};

const smallInputClass =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100";

export function AdminUsersTable({
  onSelectTenant,
}: {
  onSelectTenant?: (tenantId: string, label: string) => void;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", lastName: "", email: "" });
  const [editError, setEditError] = useState<string | null>(null);

  function loadUsers() {
    return fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
  }

  useEffect(() => {
    loadUsers().finally(() => setLoading(false));
  }, []);

  async function changeTier(userId: string, tier: number) {
    setSavingId(userId);
    try {
      await fetch(`/api/admin/users/${userId}/tier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, balance: { ...u.balance!, current_tier: tier } } : u))
      );
    } finally {
      setSavingId(null);
    }
  }

  async function toggleDemo(userId: string, isDemo: boolean) {
    setSavingId(userId);
    try {
      await fetch(`/api/admin/users/${userId}/demo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDemo }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, balance: { ...u.balance!, is_demo: isDemo } } : u))
      );
    } finally {
      setSavingId(null);
    }
  }

  async function toggleStatus(userId: string, active: boolean) {
    if (!active && !confirm("¿Dar de baja a este cliente? Se cerrarán todas sus sesiones activas.")) return;
    setSavingId(userId);
    try {
      await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, tenant_status: active ? "active" : "disabled" } : u))
      );
    } finally {
      setSavingId(null);
    }
  }

  function startEdit(u: AdminUser) {
    setEditingId(u.id);
    setEditError(null);
    setEditForm({ name: u.name ?? "", lastName: u.last_name ?? "", email: u.email });
  }

  async function saveEdit(userId: string) {
    setSavingId(userId);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          lastName: editForm.lastName || undefined,
          email: editForm.email,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEditError(data?.error ?? "No se pudo guardar.");
        return;
      }
      await loadUsers();
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-2">Cliente</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Saldo</th>
            <th className="px-4 py-2">Consumo total</th>
            <th className="px-4 py-2">Rango</th>
            <th className="px-4 py-2">Demo</th>
            <th className="px-4 py-2">Estado</th>
            <th className="px-4 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
          {users.map((u) => (
            <Fragment key={u.id}>
              <tr>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {u.tenant_id ? (
                    <button
                      onClick={() =>
                        onSelectTenant?.(u.tenant_id!, [u.name, u.last_name].filter(Boolean).join(" ") || u.email)
                      }
                      className="text-left hover:underline"
                      title="Ver pedidos de este cliente"
                    >
                      {[u.name, u.last_name].filter(Boolean).join(" ") || "—"}
                    </button>
                  ) : (
                    [u.name, u.last_name].filter(Boolean).join(" ") || "—"
                  )}
                  {u.is_admin && (
                    <span className="ml-2 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white dark:bg-zinc-100 dark:text-zinc-900">
                      admin
                    </span>
                  )}
                  {u.balance?.is_demo && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      demo
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">{u.email}</td>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {u.balance ? `${(u.balance.balance_cents / 100).toFixed(2)}€` : "—"}
                </td>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {(u.total_consumed_cents / 100).toFixed(2)}€
                </td>
                <td className="px-4 py-2">
                  <select
                    value={u.balance?.current_tier ?? 1}
                    disabled={savingId === u.id}
                    onChange={(e) => changeTier(u.id, Number(e.target.value))}
                    className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={u.balance?.is_demo ?? false}
                      disabled={savingId === u.id}
                      onChange={(e) => toggleDemo(u.id, e.target.checked)}
                    />
                    Imprime gratis
                  </label>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.tenant_status === "active"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                    }`}
                  >
                    {u.tenant_status === "active" ? "Activo" : "De baja"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => (editingId === u.id ? setEditingId(null) : startEdit(u))}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleStatus(u.id, u.tenant_status !== "active")}
                      disabled={savingId === u.id}
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      {u.tenant_status === "active" ? "Dar de baja" : "Reactivar"}
                    </button>
                  </div>
                </td>
              </tr>
              {editingId === u.id && (
                <tr>
                  <td colSpan={8} className="bg-zinc-50 px-4 py-3 dark:bg-zinc-950">
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Nombre</label>
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className={smallInputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Apellidos</label>
                        <input
                          value={editForm.lastName}
                          onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                          className={smallInputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Email</label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className={smallInputClass}
                        />
                      </div>
                      <button
                        onClick={() => saveEdit(u.id)}
                        disabled={savingId === u.id}
                        className="rounded bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Cancelar
                      </button>
                      {editError && <span className="text-xs text-red-600 dark:text-red-400">{editError}</span>}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
