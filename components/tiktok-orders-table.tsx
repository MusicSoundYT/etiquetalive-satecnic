"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AuctionOrderRow } from "@/lib/tiktok-shop/auction-orders";

const STATUS_LABELS: Record<string, string> = {
  UNPAID: "Sin pagar",
  ON_HOLD: "En espera",
  AWAITING_SHIPMENT: "Pendiente de envío",
  AWAITING_COLLECTION: "Pendiente de recogida",
  PARTIALLY_SHIPPING: "Envío parcial",
  IN_TRANSIT: "En tránsito",
  DELIVERED: "Entregado",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

function EstadoTikTokBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    DELIVERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    UNPAID: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatFecha(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Madrid",
  });
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
    setTimeout(cleanup, 60_000);
  };
  iframe.src = `/api/orders/${orderId}/label?mode=print`;
  document.body.appendChild(iframe);
}

export function TikTokOrdersTable({
  initialOrders,
  initialNextPageToken,
  shopId,
}: {
  initialOrders: AuctionOrderRow[];
  initialNextPageToken: string | null;
  // Filtra a una sola tienda de TikTok cuando el tenant tiene varias
  // conectadas. Si cambia (el usuario elige otra tienda en el selector), se
  // vuelve a cargar la lista desde el principio para esa tienda.
  shopId?: string | null;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [nextPageToken, setNextPageToken] = useState(initialNextPageToken);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // La primera carga (initialOrders) ya viene filtrada por el servidor para
  // este shopId — solo hay que recargar si el usuario cambia de tienda
  // DESPUÉS del primer render, no en el propio montaje.
  const mountedShopId = useRef(shopId);
  useEffect(() => {
    if (shopId === mountedShopId.current) return;
    mountedShopId.current = shopId;
    const query = shopId ? `?shop_id=${encodeURIComponent(shopId)}` : "";
    fetch(`/api/tiktok/orders${query}`)
      .then((res) => res.json())
      .then((data) => {
        setOrders(data.orders ?? []);
        setNextPageToken(data.nextPageToken ?? null);
      })
      .catch(() => setActionError("No se pudieron cargar los pedidos de esta tienda."));
  }, [shopId]);

  // Refresco automático de la lista visual — el popup de imprimir ya se
  // dispara solo, pero la tabla en sí solo se cargaba una vez al abrir la
  // página. Se vuelve a pedir la primera página cada pocos segundos y se
  // añaden arriba solo los pedidos que todavía no estuvieran en pantalla,
  // sin tocar las filas ya cargadas (para no perder notas/estado en curso).
  useEffect(() => {
    const interval = setInterval(() => {
      const query = shopId ? `?shop_id=${encodeURIComponent(shopId)}` : "";
      fetch(`/api/tiktok/orders${query}`)
        .then((res) => res.json())
        .then((data) => {
          const fresh: AuctionOrderRow[] = data.orders ?? [];
          setOrders((prev) => {
            const knownIds = new Set(prev.map((o) => o.tiktokOrderId));
            const newOnes = fresh.filter((o) => !knownIds.has(o.tiktokOrderId));
            if (!newOnes.length) return prev;
            return [...newOnes, ...prev];
          });
        })
        .catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, [shopId]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2000);
  }

  function updateRow(tiktokOrderId: string, patch: Partial<AuctionOrderRow>) {
    setOrders((prev) => prev.map((o) => (o.tiktokOrderId === tiktokOrderId ? { ...o, ...patch } : o)));
  }

  async function handleLoadMore() {
    if (!nextPageToken) return;
    setLoadingMore(true);
    try {
      const shopParam = shopId ? `&shop_id=${encodeURIComponent(shopId)}` : "";
      const res = await fetch(`/api/tiktok/orders?page_token=${encodeURIComponent(nextPageToken)}${shopParam}`);
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "No se pudieron cargar más pedidos.");
        return;
      }
      setOrders((prev) => [...prev, ...data.orders]);
      setNextPageToken(data.nextPageToken);
    } finally {
      setLoadingMore(false);
    }
  }

  async function ensureSynced(row: AuctionOrderRow): Promise<NonNullable<AuctionOrderRow["local"]> | null> {
    if (row.local) return row.local;
    const res = await fetch(`/api/tiktok/orders/${row.tiktokOrderId}/sync`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setActionError(data.error ?? "No se pudo sincronizar el pedido.");
      return null;
    }
    const local = { id: data.id, tk: data.tk, notes: null, estado_impresion: "detectado", impresiones_cobrables: 0 };
    updateRow(row.tiktokOrderId, { local });
    return local;
  }

  async function handlePrintAction(row: AuctionOrderRow) {
    setActionError(null);
    setPendingId(row.tiktokOrderId);
    try {
      const local = await ensureSynced(row);
      if (!local) return;

      const endpoint = row.local && row.local.impresiones_cobrables > 0 ? "reprint" : "print";
      const res = await fetch(`/api/orders/${local.id}/${endpoint}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "No se pudo procesar la acción.");
        return;
      }
      printLabel(local.id);
      updateRow(row.tiktokOrderId, {
        local: {
          ...local,
          notes: row.local?.notes ?? null,
          estado_impresion: "impreso",
          impresiones_cobrables: 1,
        },
      });
    } finally {
      setPendingId(null);
    }
  }

  async function handleNotesBlur(row: AuctionOrderRow, notes: string) {
    if (notes === (row.local?.notes ?? "")) return;
    const local = await ensureSynced(row);
    if (!local) return;
    try {
      const res = await fetch(`/api/orders/${local.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      showToast(res.ok ? "Nota guardada" : "No se pudo guardar la nota");
      if (res.ok) updateRow(row.tiktokOrderId, { local: { ...local, notes } });
    } catch {
      showToast("No se pudo guardar la nota");
    }
  }

  return (
    <div>
      {actionError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[1200px] table-fixed text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="w-24 px-4 py-2">TK</th>
              <th className="w-48 px-4 py-2">ID de pedido</th>
              <th className="w-48 px-4 py-2">Cliente</th>
              <th className="w-24 px-4 py-2">Precio</th>
              <th className="w-48 px-4 py-2">Fecha</th>
              <th className="w-32 px-4 py-2">Estado (TikTok)</th>
              <th className="w-40 px-4 py-2">Notas</th>
              <th className="w-40 px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                  No se han encontrado pedidos de subasta todavía.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.tiktokOrderId}>
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {o.local?.tk ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {o.tiktokOrderId}
                  </td>
                  <td className="break-words px-4 py-2 text-zinc-700 dark:text-zinc-300">{o.cliente}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {(o.priceCents / 100).toFixed(2)}
                    {o.currency === "EUR" ? "€" : o.currency}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {formatFecha(o.createTime)}
                  </td>
                  <td className="px-4 py-2">
                    <EstadoTikTokBadge status={o.status} />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      defaultValue={o.local?.notes ?? ""}
                      placeholder="Añadir nota…"
                      onBlur={(e) => handleNotesBlur(o, e.target.value)}
                      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-zinc-700 hover:border-zinc-300 focus:border-zinc-400 focus:outline-none dark:text-zinc-300 dark:hover:border-zinc-700"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      {o.local && (
                        <Link
                          href={`/orders/${o.local.id}`}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Ver
                        </Link>
                      )}
                      <button
                        onClick={() => handlePrintAction(o)}
                        disabled={pendingId === o.tiktokOrderId}
                        className="rounded bg-zinc-900 px-2 py-1 text-xs text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                      >
                        {pendingId === o.tiktokOrderId
                          ? "…"
                          : o.local && o.local.impresiones_cobrables > 0
                            ? "Reimprimir"
                            : "Imprimir"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <span>{orders.length} pedido(s) de subasta cargado(s)</span>
        {nextPageToken && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-50 dark:border-zinc-700"
          >
            {loadingMore ? "Cargando…" : "Cargar más"}
          </button>
        )}
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {toast}
        </div>
      )}
    </div>
  );
}
