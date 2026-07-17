"use client";

import { useEffect, useState } from "react";

type Summary = {
  year: number;
  month: number;
  ordersCount: number;
  tenantsCount: number;
  totalCents: number;
  rechargedCents: number;
  pendingDebtCents: number;
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
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
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
  // Rango de exportación: "hasta" es siempre el mes que se está viendo
  // arriba; "desde" empieza igual a "hasta" (exporta solo ese mes por
  // defecto) y se puede llevar más atrás para exportar varios meses juntos.
  const [exportFromYear, setExportFromYear] = useState(initial.year);
  const [exportFromMonth, setExportFromMonth] = useState(initial.month);

  // De START_YEAR al año real actual, calculado con la fecha del propio
  // navegador — así cada 1 de enero se añade el año nuevo solo.
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

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="text-[10px] uppercase text-amber-700 dark:text-amber-400">Pendiente de cobro</div>
          <div className="text-lg font-semibold text-amber-900 dark:text-amber-300">
            {loading || !summary ? "…" : `${(summary.pendingDebtCents / 100).toFixed(2)}€`}
          </div>
          <div className="mt-0.5 text-[10px] text-amber-700/80 dark:text-amber-400/80">
            Saldo negativo actual de clientes (hasta -2€ cada uno) — ya facturado, aún no cobrado.
            No es una cifra del mes, es a día de hoy.
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

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Exportar CSV desde</label>
          <div className="flex gap-2">
            <select
              value={exportFromMonth}
              onChange={(e) => setExportFromMonth(Number(e.target.value))}
              className={selectClass}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={exportFromYear}
              onChange={(e) => setExportFromYear(Number(e.target.value))}
              className={selectClass}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <span className="pb-2 text-xs text-zinc-500 dark:text-zinc-400">
          hasta {MONTH_NAMES[month - 1]} de {year}
        </span>
        <a
          href={`/api/admin/billing-summary/export?fromYear=${exportFromYear}&fromMonth=${exportFromMonth}&toYear=${year}&toMonth=${month}`}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Exportar CSV
        </a>
      </div>
    </div>
  );
}
