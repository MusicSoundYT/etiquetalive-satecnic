"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Order = {
  id: string;
  tk: string;
  cliente: string | null;
  precio_cents: number;
  moneda: string;
  fecha_detectado: string;
  estado_impresion: string;
  reimpresiones: number;
  impresiones_cobrables: number;
  notes: string | null;
};

function EstadoBadge({ estado }: { estado: string }) {
  const styles: Record<string, string> = {
    detectado: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    impreso: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    reimpreso: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[estado] ?? styles.detectado}`}>
      {estado}
    </span>
  );
}

export function OrdersTable({
  orders,
  total,
  page,
  pageSize,
}: {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function hrefWith(overrides: Record<string, string>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) params.set(key, value);
    return `?${params.toString()}`;
  }

  const currentSort = searchParams.get("sort") ?? "fecha";
  const currentDir = searchParams.get("dir") === "asc" ? "asc" : "desc";

  function sortableHeader(column: string, label: string) {
    const isActive = currentSort === column;
    const nextDir = isActive && currentDir === "desc" ? "asc" : "desc";
    return (
      <Link href={hrefWith({ sort: column, dir: nextDir, page: "1" })} className="flex items-center gap-1 hover:underline">
        {label}
        {isActive && <span>{currentDir === "asc" ? "▲" : "▼"}</span>}
      </Link>
    );
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2000);
  }

  async function handlePrintAction(order: Order) {
    setActionError(null);
    setPendingId(order.id);
    try {
      const endpoint = order.impresiones_cobrables > 0 ? "reprint" : "print";
      const res = await fetch(`/api/orders/${order.id}/${endpoint}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "No se pudo procesar la acción.");
        return;
      }
      // El cobro (si aplica) ya se ha confirmado en el servidor: ahora sí se
      // puede cargar la etiqueta real (mode=print) e imprimirla.
      printLabel(order.id);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  function printLabel(orderId: string) {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");

    const cleanup = () => iframe.remove();
    iframe.onload = () => {
      iframe.contentWindow?.addEventListener("afterprint", cleanup);
      iframe.contentWindow?.print();
      // Red de seguridad por si el navegador no dispara "afterprint".
      setTimeout(cleanup, 60_000);
    };
    iframe.src = `/api/orders/${orderId}/label?mode=print`;
    document.body.appendChild(iframe);
  }

  async function handleNotesBlur(order: Order, notes: string) {
    if (notes === (order.notes ?? "")) return;
    try {
      const res = await fetch(`/api/orders/${order.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      showToast(res.ok ? "Nota guardada" : "No se pudo guardar la nota");
      router.refresh();
    } catch {
      showToast("No se pudo guardar la nota");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      {actionError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">{sortableHeader("tk", "TK")}</th>
              <th className="px-4 py-2">{sortableHeader("cliente", "Cliente")}</th>
              <th className="px-4 py-2">{sortableHeader("precio", "Precio")}</th>
              <th className="px-4 py-2">{sortableHeader("fecha", "Fecha")}</th>
              <th className="px-4 py-2">{sortableHeader("estado", "Estado")}</th>
              <th className="px-4 py-2">Notas</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  No hay pedidos todavía.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">{o.tk}</td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{o.cliente ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {(o.precio_cents / 100).toFixed(2)}
                    {o.moneda === "EUR" ? "€" : o.moneda}
                  </td>
                  <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                    {new Date(o.fecha_detectado).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2">
                    <EstadoBadge estado={o.estado_impresion} />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      defaultValue={o.notes ?? ""}
                      placeholder="Añadir nota…"
                      onBlur={(e) => handleNotesBlur(o, e.target.value)}
                      className="w-40 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-zinc-700 hover:border-zinc-300 focus:border-zinc-400 focus:outline-none dark:text-zinc-300 dark:hover:border-zinc-700"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <Link
                        href={`/orders/${o.id}`}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Ver
                      </Link>
                      <button
                        onClick={() => handlePrintAction(o)}
                        disabled={pendingId === o.id}
                        className="rounded bg-zinc-900 px-2 py-1 text-xs text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                      >
                        {o.impresiones_cobrables > 0 ? "Reimprimir" : "Imprimir"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <span>
          {total} pedido{total === 1 ? "" : "s"} en total
        </span>
        <div className="flex items-center gap-2">
          <Link
            href={hrefWith({ page: String(Math.max(1, page - 1)) })}
            aria-disabled={page <= 1}
            className={`rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 ${
              page <= 1 ? "pointer-events-none opacity-40" : ""
            }`}
          >
            Anterior
          </Link>
          <span>
            Página {page} de {totalPages}
          </span>
          <Link
            href={hrefWith({ page: String(Math.min(totalPages, page + 1)) })}
            aria-disabled={page >= totalPages}
            className={`rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 ${
              page >= totalPages ? "pointer-events-none opacity-40" : ""
            }`}
          >
            Siguiente
          </Link>
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {toast}
        </div>
      )}
    </div>
  );
}
