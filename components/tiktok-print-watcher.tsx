"use client";

import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 5000;

function printLabelHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => iframe.remove();
  iframe.onload = () => {
    iframe.contentWindow?.addEventListener("afterprint", cleanup);
    iframe.contentWindow?.print();
    setTimeout(cleanup, 60_000);
  };

  const doc = iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  }
}

/**
 * Mientras esta pestaña esté abierta, pregunta cada pocos segundos al
 * servidor si hay etiquetas ya cobradas (por el aviso automático de TikTok,
 * o por la extensión si falló al imprimir) esperando a que alguien las
 * imprima de verdad, y las imprime sola — sin volver a leer nada de TikTok.
 */
export function TikTokPrintWatcher() {
  const [active, setActive] = useState(true);
  const [printedCount, setPrintedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    async function poll() {
      try {
        const res = await fetch("/api/tiktok/pending-print");
        if (!res.ok) return;
        const data = await res.json();
        const orders: { label_html: string }[] = data.orders ?? [];
        for (const order of orders) printLabelHtml(order.label_html);
        if (orders.length) setPrintedCount((c) => c + orders.length);
      } catch {
        setError("No se pudo consultar si hay etiquetas pendientes.");
      }
    }

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-zinc-400"}`} aria-hidden="true" />
      <span className="text-zinc-700 dark:text-zinc-300">
        {active
          ? "Vigilando pedidos nuevos para imprimir automáticamente mientras esta pestaña esté abierta."
          : "Impresión automática en pausa."}
      </span>
      <button
        onClick={() => setActive((a) => !a)}
        className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {active ? "Pausar" : "Reanudar"}
      </button>
      {printedCount > 0 && (
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{printedCount} impresas esta sesión</span>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
