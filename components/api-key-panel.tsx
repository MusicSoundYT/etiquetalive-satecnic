"use client";

import { useEffect, useState } from "react";
import { buttonClass, ErrorText } from "@/components/auth-shell";

type ApiKeyMeta = {
  id: string;
  key_prefix: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "nunca";
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

export function ApiKeyPanel() {
  const [meta, setMeta] = useState<ApiKeyMeta | null | undefined>(undefined);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [revealing, setRevealing] = useState(false);
  const [revealPassword, setRevealPassword] = useState("");
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealedCopied, setRevealedCopied] = useState(false);

  useEffect(() => {
    fetch("/api/account/api-key")
      .then((res) => res.json())
      .then((data) => setMeta(data.apiKey ?? null))
      .catch(() => setMeta(null));
  }, []);

  async function handleGenerate() {
    const isRegenerate = !!meta;
    if (
      isRegenerate &&
      !confirm(
        "Esto invalida la clave anterior de inmediato: la extensión de Chrome dejará de funcionar hasta que pegues la nueva clave. ¿Continuar?"
      )
    ) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/account/api-key", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo generar la clave.");
        return;
      }
      setNewKey(data.key);
      setMeta(data.apiKey ?? null);
      setCopied(false);
      setRevealing(false);
      setRevealedKey(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
  }

  function startReveal() {
    setRevealing(true);
    setRevealedKey(null);
    setRevealError(null);
    setRevealPassword("");
    setRevealedCopied(false);
  }

  async function handleReveal() {
    setRevealError(null);
    setRevealLoading(true);
    try {
      const res = await fetch("/api/account/api-key/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: revealPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRevealError(data.error ?? "No se pudo recuperar la clave.");
        return;
      }
      setRevealedKey(data.key);
    } finally {
      setRevealLoading(false);
    }
  }

  async function handleCopyRevealed() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setRevealedCopied(true);
  }

  if (meta === undefined) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>;
  }

  return (
    <div className="max-w-sm space-y-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Esta clave conecta la extensión de Chrome de EtiquetaLive con tu cuenta para que las ventas
        detectadas en TikTok se registren automáticamente. Pégala en el popup de la extensión
        (&quot;Conectar&quot;).
      </p>

      {newKey && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <p className="mb-2 font-medium text-amber-900 dark:text-amber-200">
            Copia esta clave ahora: no podrás volver a verla.
          </p>
          <code className="block break-all rounded bg-white px-2 py-1 text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
            {newKey}
          </code>
          <button
            onClick={handleCopy}
            className="mt-2 rounded border border-amber-400 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            {copied ? "Copiada ✓" : "Copiar"}
          </button>
        </div>
      )}

      {meta && !newKey && (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{meta.key_prefix}…</div>
          <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Creada el {formatDate(meta.created_at)} · Último uso: {formatDate(meta.last_used_at)}
          </div>
        </div>
      )}

      {!meta && !newKey && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Todavía no tienes ninguna clave generada.</p>
      )}

      {meta && !newKey && !revealing && (
        <button
          onClick={startReveal}
          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Ver clave API
        </button>
      )}

      {revealing && !revealedKey && (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Repite tu contraseña para volver a mostrar la clave activa.
          </p>
          <input
            type="password"
            value={revealPassword}
            onChange={(e) => setRevealPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleReveal()}
            placeholder="Contraseña"
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <div className="flex gap-2">
            <button
              onClick={handleReveal}
              disabled={revealLoading || !revealPassword}
              className={`${buttonClass} w-auto px-3 py-1 text-xs`}
            >
              {revealLoading ? "Comprobando…" : "Mostrar"}
            </button>
            <button
              onClick={() => setRevealing(false)}
              className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
          </div>
          <ErrorText message={revealError} />
        </div>
      )}

      {revealedKey && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <p className="mb-2 font-medium text-amber-900 dark:text-amber-200">Tu clave activa:</p>
          <code className="block break-all rounded bg-white px-2 py-1 text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
            {revealedKey}
          </code>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleCopyRevealed}
              className="rounded border border-amber-400 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              {revealedCopied ? "Copiada ✓" : "Copiar"}
            </button>
            <button
              onClick={() => setRevealing(false)}
              className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Ocultar
            </button>
          </div>
        </div>
      )}

      <button onClick={handleGenerate} disabled={loading} className={`${buttonClass} w-auto px-4`}>
        {loading ? "Generando…" : meta ? "Regenerar clave" : "Generar clave"}
      </button>
      <ErrorText message={error} />
    </div>
  );
}
