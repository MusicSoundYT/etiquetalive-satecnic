"use client";

import { useEffect, useState } from "react";

type Stats = {
  totalTenants: number;
  totalUsers: number;
  totalOrders: number;
  totalImpresiones: number;
  totalFacturableCents: number;
};

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</div>
    </div>
  );
}

export function AdminStatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => setStats(null));
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Card label="Clientes" value={stats ? String(stats.totalTenants) : "…"} />
      <Card label="Usuarios" value={stats ? String(stats.totalUsers) : "…"} />
      <Card label="Pedidos" value={stats ? String(stats.totalOrders) : "…"} />
      <Card label="Impresiones" value={stats ? String(stats.totalImpresiones) : "…"} />
      <Card
        label="Facturable"
        value={stats ? `${(stats.totalFacturableCents / 100).toFixed(2)}€` : "…"}
      />
    </div>
  );
}
