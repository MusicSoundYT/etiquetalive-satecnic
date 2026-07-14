"use client";

import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  last_name: string | null;
  is_admin: boolean;
  balance: { current_tier: number; balance_cents: number; is_blocked: boolean; is_demo: boolean } | null;
};

export function AdminUsersTable() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .finally(() => setLoading(false));
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

  if (loading) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-2">Cliente</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Saldo</th>
            <th className="px-4 py-2">Rango</th>
            <th className="px-4 py-2">Demo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                {[u.name, u.last_name].filter(Boolean).join(" ") || "—"}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
