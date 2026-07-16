"use client";

import { useEffect, useState } from "react";

type Summary = {
  year: number;
  month: number;
  ordersCount: number;
  tenantsCount: number;
  totalCents: number;
  rechargedCents: number;
};

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Año en que arrancó el sistema — el desplegable de año va desde aquí hasta
// el año real actual (calculado con la fecha del propio navegador, así que
// cada 1 de enero se añade el nuevo año solo, sin desplegar nada).
const START_YEAR = 2026;

function defaultYearMonth(): { year: number; month: number } {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1 };
}

// Selects en vez de <input type="month">: ese control nativo no lo soportan
// todos los navegadores por igual (Firefox, por ejemplo, lo muestra como un
// simple campo de texto sin desplegable) — con selects funciona igual en todos.
export function AdminMonthlyBilling() {
  const initial = defaultYearMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // De START_YEAR al año real actual (no al año del "mes por defecto", que es
  // el mes anterior) — así en enero de un año nuevo el año actual ya aparece
  // aunque el "mes por defecto" siga siendo diciembre del año anterior.
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - START_YEAR + 1 }, (_, i) => currentYear - i);
  const selectClass =
    "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  useEffect(() => {
    const id = setTimeout(() => setLoading(true), 0);
    fetch(`/api/admin/billing-summary?year=${year}&month=${month}`)
      .then((res) => res.json())
      .then(setSummary)
      .finally(() => setLoading(false));
    return () => clearTimeout(id);
  }, [year, month]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Mes</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectClass}>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Año</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        {summary && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {MONTH_NAMES[summary.month - 1]} de {summary.year}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">Saldo recargado</div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {loading || !summary ? "…" : `${(summary.rechargedCents / 100).toFixed(2)}€`}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
            Dinero real cobrado por Stripe este mes
          </div>
        </div>
        <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">Facturado por etiquetas</div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {loading || !summary ? "…" : `${(summary.totalCents / 100).toFixed(2)}€`}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
            Según las etiquetas cobradas este mes
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
