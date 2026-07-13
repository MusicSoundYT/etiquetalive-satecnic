"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, ErrorText } from "@/components/auth-shell";

export function LabelPreview({
  orderId,
  initialCharged,
}: {
  orderId: string;
  initialCharged: boolean;
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [charged, setCharged] = useState(initialCharged);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePrint() {
    setError(null);
    setLoading(true);
    try {
      // Misma lógica que en el listado de pedidos: la primera vez cobra
      // (print), a partir de ahí solo reimprime (no vuelve a cobrar).
      const endpoint = charged ? "reprint" : "print";
      const res = await fetch(`/api/orders/${orderId}/${endpoint}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo procesar la impresión.");
        return;
      }
      setCharged(true);
      iframeRef.current?.contentWindow?.print();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div
        onContextMenu={(e) => e.preventDefault()}
        className="overflow-auto rounded-lg border border-zinc-200 bg-zinc-100 p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <iframe
          ref={iframeRef}
          src={`/api/orders/${orderId}/label`}
          title="Etiqueta"
          className="mx-auto h-40 w-full max-w-xs bg-white"
        />
      </div>
      <button onClick={handlePrint} disabled={loading} className={`${buttonClass} mt-3`}>
        {loading ? "Procesando..." : charged ? "Reimprimir etiqueta" : "Imprimir etiqueta"}
      </button>
      <ErrorText message={error} />
    </div>
  );
}
