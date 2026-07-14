"use client";

import { useEffect, useState } from "react";

type Transaction = {
  id: number;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  description: string | null;
  created_at: string;
};

type HistoryResponse = {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  summary: { spentThisMonthCents: number; rechargedThisMonthCents: number };
};

const TYPE_LABELS: Record<string, string> = {
  recharge: "Recarga",
  label_consumption: "Etiqueta impresa",
  referral_bonus: "Bono por referido",
  promo_credit: "Crédito promocional",
  debt_settlement: "Liquidación de deuda",
  refund: "Reembolso",
  admin_credit: "Ajuste (abono)",
  admin_debit: "Ajuste (cargo)",
};

function formatEuros(cents: number): string {
  return (cents / 100).toFixed(2) + "€";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BillingHistoryPanel() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setLoading(true), 0);
    fetch(`/api/billing/history?page=${page}`)
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
    return () => clearTimeout(id);
  }, [page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Historial de gastos</h3>

      {data && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">Gastado este mes</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {formatEuros(data.summary.spentThisMonthCents)}
            </div>
          </div>
          <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">Recargado este mes</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {formatEuros(data.summary.rechargedThisMonthCents)}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead className="text-left uppercase text-zinc-400 dark:text-zinc-500">
            <tr>
              <th className="py-1.5 pr-2">Fecha</th>
              <th className="py-1.5 pr-2">Concepto</th>
              <th className="py-1.5 pr-2 text-right">Importe</th>
              <th className="py-1.5 text-right">Saldo tras</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-zinc-400">
                  Cargando…
                </td>
              </tr>
            ) : !data || data.transactions.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-zinc-400">
                  Todavía no hay movimientos.
                </td>
              </tr>
            ) : (
              data.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="py-1.5 pr-2 text-zinc-500 dark:text-zinc-400">{formatDate(t.created_at)}</td>
                  <td className="py-1.5 pr-2 text-zinc-700 dark:text-zinc-300">
                    {TYPE_LABELS[t.type] ?? t.type}
                    {t.description ? ` — ${t.description}` : ""}
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right font-medium ${
                      t.amount_cents < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {t.amount_cents >= 0 ? "+" : ""}
                    {formatEuros(t.amount_cents)}
                  </td>
                  <td className="py-1.5 text-right text-zinc-500 dark:text-zinc-400">
                    {formatEuros(t.balance_after_cents)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40 dark:border-zinc-700"
          >
            Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40 dark:border-zinc-700"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
