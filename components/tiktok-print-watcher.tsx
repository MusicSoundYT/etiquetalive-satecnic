"use client";

import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 2000;
const BROADCAST_STORAGE_KEY = "el_print_broadcast_enabled";
const DEVICE_ID_STORAGE_KEY = "el_print_device_id";

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

/** Un identificador aleatorio propio de este navegador — no identifica al
 * usuario, solo distingue "este ordenador" de cualquier otro que tenga la
 * misma cuenta abierta, para que el servidor pueda entregarle su propia
 * copia de cada etiqueta cuando el reparto duplicado está activado. Se
 * genera una vez y se guarda en localStorage: sobrevive a recargas, pero es
 * distinto en cada ordenador/navegador. */
function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * El sondeo real corre dentro de un Web Worker, no con un setInterval normal
 * de la pestaña. Motivo, visto en producción: Chrome frena mucho los
 * temporizadores del hilo principal cuando la pestaña lleva un rato en
 * segundo plano (minimizada, u otra ventana/pestaña delante) — pasados unos
 * minutos así, un sondeo pensado para cada 2 segundos pasa a comprobar solo
 * una vez por minuto (un ordenador de Woow se quedó así en pleno directo y
 * casi no le llegaban etiquetas). Un Web Worker no sufre ese mismo frenado,
 * así que sigue preguntando al servidor a su ritmo aunque nadie esté mirando
 * esa pestaña. Solo la impresión en sí (que necesita el documento/DOM) se
 * hace de vuelta en el hilo principal, al recibir el mensaje del worker.
 */
function createPollWorker(): Worker {
  const workerCode = `
    self.onmessage = (e) => {
      const { url, intervalMs } = e.data;
      async function poll() {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.json();
          self.postMessage({ type: "orders", orders: data.orders || [] });
        } catch (err) {
          self.postMessage({ type: "error", message: String(err) });
        }
      }
      poll();
      setInterval(poll, intervalMs);
    };
  `;
  const blob = new Blob([workerCode], { type: "application/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

/**
 * Mientras esta pestaña esté abierta, pregunta cada pocos segundos al
 * servidor si hay etiquetas ya cobradas (por el aviso automático de TikTok,
 * o por la extensión si falló al imprimir) esperando a que alguien las
 * imprima de verdad, y las imprime sola — sin volver a leer nada de TikTok.
 *
 * shopId (opcional): si el tenant tiene varias tiendas de TikTok conectadas
 * (varias trabajadoras, cada una con la suya), limita la impresión
 * automática a los pedidos de esa tienda — sin esto, cualquier pestaña con
 * la misma cuenta de EtiquetaLive imprimía TODOS los pedidos, de cualquier
 * tienda.
 *
 * "Imprimir también en otros ordenadores" (por ordenador, activado por
 * defecto): sin esto, cuando dos puestos de trabajo tienen esta misma
 * pantalla abierta para la misma tienda (p. ej. dos mesas de empaquetado de
 * un mismo directo), cada etiqueta solo sale en el ordenador que gane la
 * carrera por preguntarle antes al servidor — el otro se queda sin ella. Va
 * activado desde el principio en cada ordenador nuevo (no hace falta
 * acordarse de marcarlo a mano); cada uno puede desactivarlo si de verdad
 * quiere volver al reparto exclusivo de antes. Sigue respetando shopId —
 * nunca imprime etiquetas de otra tienda o directo del mismo tenant.
 */
export function TikTokPrintWatcher({ shopId }: { shopId?: string | null }) {
  const [active, setActive] = useState(true);
  const [printedCount, setPrintedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState(true);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BROADCAST_STORAGE_KEY);
      // Sin preferencia guardada todavía (ordenador nuevo): activado por
      // defecto. Si alguien lo desactivó antes en este navegador, se respeta.
      setBroadcast(stored === null ? true : stored === "1");
    } catch {
      // Sin localStorage disponible, se queda en el valor por defecto (true).
    }
  }, []);

  function handleBroadcastToggle(next: boolean) {
    setBroadcast(next);
    try {
      localStorage.setItem(BROADCAST_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Sin localStorage esto no persiste entre recargas, pero la sesión actual sigue funcionando.
    }
  }

  useEffect(() => {
    if (!active) {
      workerRef.current?.terminate();
      workerRef.current = null;
      return;
    }

    const params = new URLSearchParams();
    if (shopId) params.set("shop_id", shopId);
    if (broadcast) params.set("device_id", getOrCreateDeviceId());
    const query = params.toString() ? `?${params.toString()}` : "";
    const url = `${window.location.origin}/api/tiktok/pending-print${query}`;

    const worker = createPollWorker();
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; orders?: { label_html: string }[] };
      if (msg.type === "orders") {
        const orders = msg.orders ?? [];
        for (const order of orders) printLabelHtml(order.label_html);
        if (orders.length) setPrintedCount((c) => c + orders.length);
      } else if (msg.type === "error") {
        setError("No se pudo consultar si hay etiquetas pendientes.");
      }
    };
    worker.postMessage({ url, intervalMs: POLL_INTERVAL_MS });
    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [active, shopId, broadcast]);

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
      <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400" title="Activado por defecto: cada ordenador que tenga esta pantalla abierta recibe su propia copia de cada etiqueta de esta tienda.">
        <input type="checkbox" checked={broadcast} onChange={(e) => handleBroadcastToggle(e.target.checked)} />
        Imprimir también en otros ordenadores
      </label>
      {printedCount > 0 && (
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{printedCount} impresas esta sesión</span>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
