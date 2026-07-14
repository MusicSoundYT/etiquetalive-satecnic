"use client";

import { useEffect, useState } from "react";

type Summary = { year: number; month: number; ordersCount: number; tenantsCount: number; totalCents: number };

function defaultMonthValue(): string {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function AdminMonthlyBilling() {
  const [monthValue, setMonthValue] = useState(defaultMonthValue());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const [year, month] = monthValue.split("-").map(Number);
    const id = setTimeout(() => setLoading(true), 0);
    fetch(`/api/admin/billing-summary?year=${year}&month=${month}`)
      .then((res) => res.json())
      .then(setSummary)
      .finally(() => setLoading(false));
    return () => clearTimeout(id);
  }, [monthValue]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Mes</label>
          <input
            type="month"
            value={monthValue}
            onChange={(e) => setMonthValue(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        {summary && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {MONTH_NAMES[summary.month - 1]} de {summary.year}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">Facturado</div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {loading || !summary ? "…" : `${(summary.totalCents / 100).toFixed(2)}€`}
          </div>
        </div>
        <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">Etiquetas cobradas</div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {loading || !summary ? "…" : summary.ordersCount}
          </div>
        </div>
        <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">Clientes con actividad</div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {loading || !summary ? "…" : summary.tenantsCount}
          </div>
        </div>
      </div>
    </div>
  );
}
