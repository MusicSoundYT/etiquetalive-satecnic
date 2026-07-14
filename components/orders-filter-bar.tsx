"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const smallInputClass =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100";

export function OrdersFilterBar({ exportPath = "/api/orders/export" }: { exportPath?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    for (const [key, value] of [["q", q], ["from", from], ["to", to]] as const) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  const sort = searchParams.get("sort");
  const dir = searchParams.get("dir");
  if (sort) exportParams.set("sort", sort);
  if (dir) exportParams.set("dir", dir);

  return (
    <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Buscar (TK o cliente)</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej. 00042 o María"
          className={`${smallInputClass} w-44`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Desde</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={smallInputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Hasta</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={smallInputClass} />
      </div>
      <button
        type="submit"
        className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Filtrar
      </button>
      <a
        href={`${exportPath}?${exportParams.toString()}`}
        className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Exportar CSV
      </a>
    </form>
  );
}
