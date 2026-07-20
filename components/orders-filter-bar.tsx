"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const smallInputClass =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100";

/**
 * Filtro + tabla de pedidos en un único componente cliente: la búsqueda se
 * aplica sola (con un pequeño debounce) sin necesitar el botón "Filtrar", y
 * si se borra el texto vuelve a mostrar todos los pedidos automáticamente.
 * El resultado (children, renderizado en el servidor con los props ya
 * actualizados) se atenúa mientras la navegación está en curso, a modo de
 * indicador de carga.
 */
export function OrdersFilterBar({
  exportPath = "/api/orders/export",
  children,
}: {
  exportPath?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const current = {
      q: searchParams.get("q") ?? "",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    };
    if (q === current.q && from === current.from && to === current.to) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", "1");
      for (const [key, value] of [["q", q], ["from", from], ["to", to]] as const) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, from, to]);

  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  const sort = searchParams.get("sort");
  const dir = searchParams.get("dir");
  if (sort) exportParams.set("sort", sort);
  if (dir) exportParams.set("dir", dir);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Buscar (TK o cliente)</label>
          <div className="relative">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ej. 00042 o María"
              className={`${smallInputClass} w-44 pr-7`}
            />
            {isPending && (
              <span
                aria-hidden
                className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-200"
              />
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={smallInputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={smallInputClass} />
        </div>
        <a
          href={`${exportPath}?${exportParams.toString()}`}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Exportar CSV
        </a>
      </div>
      {children && (
        <div className={`mt-4 transition-opacity ${isPending ? "pointer-events-none opacity-50" : ""}`}>
          {children}
        </div>
      )}
    </div>
  );
}
