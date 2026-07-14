"use client";

import { useEffect, useState } from "react";

type AdminOrder = {
  id: string;
  tk: string;
  cliente: string | null;
  precio_cents: number;
  moneda: string;
  fecha_detectado: string;
  estado_impresion: string;
  reimpresiones: number;
};

const smallInputClass =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100";

/**
 * Pedidos de un cliente concreto. El padre monta este componente con
 * key={tenantId}, así que cada vez que cambia de cliente se remonta entero y
 * el estado (filtros, página, pedidos) arranca limpio sin necesidad de un
 * efecto que lo resetee a mano.
 */
export function AdminOrdersPanel({
  tenantId,
  tenantLabel,
}: {
  tenantId: string;
  tenantLabel: string;
}) {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setLoading(true), 0);
    const params = new URLSearchParams({ page: String(page), tenantId });
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/admin/orders?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setOrders(data.orders ?? []);
        setTotal(data.total ?? 0);
        setPageSize(data.pageSize ?? 25);
      })
      .finally(() => setLoading(false));
    return () => clearTimeout(id);
  }, [tenantId, q, from, to, page]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
  }

  const exportParams = new URLSearchParams({ tenantId });
  if (q) exportParams.set("q", q);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Pedidos de {tenantLabel}
      </h3>
      <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Buscar (TK o comprador)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} className={`${smallInputClass} w-44`} />
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
          href={`/api/admin/orders/export?${exportParams.toString()}`}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Exportar CSV
        </a>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">TK</th>
              <th className="px-3 py-2">Comprador</th>
              <th className="px-3 py-2">Precio</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                  Cargando…
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                  No hay pedidos con estos filtros.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">{o.tk}</td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{o.cliente ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                    {(o.precio_cents / 100).toFixed(2)}
                    {o.moneda === "EUR" ? "€" : o.moneda}
                  </td>
                  <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                    {new Date(o.fecha_detectado).toLocaleString("es-ES", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{o.estado_impresion}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>{total} pedidos en total</span>
          <div className="flex items-center gap-2">
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
        </div>
      )}
    </div>
  );
}
