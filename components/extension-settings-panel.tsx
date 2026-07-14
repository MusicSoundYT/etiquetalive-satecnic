"use client";

import { useEffect, useState } from "react";
import { ErrorText } from "@/components/auth-shell";

type Settings = { autoPrintEnabled: boolean; sellerRefreshSeconds: number };

export function ExtensionSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/account/extension-settings")
      .then((res) => res.json())
      .then(setSettings)
      .catch(() => setError("No se pudo cargar la configuración."));
  }, []);

  async function save(next: Settings) {
    setSettings(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account/extension-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoPrintEnabled: next.autoPrintEnabled,
          sellerRefreshSeconds: next.sellerRefreshSeconds,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "No se pudo guardar la configuración.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>;
  }

  return (
    <div className="max-w-sm space-y-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Controla cómo se comporta la extensión de Chrome mientras detecta pedidos en tu directo de
        TikTok.
      </p>

      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={settings.autoPrintEnabled}
          disabled={saving}
          onChange={(e) => save({ ...settings, autoPrintEnabled: e.target.checked })}
        />
        Impresión automática al detectar pedido
      </label>

      <label className="block text-sm text-zinc-700 dark:text-zinc-300">
        <span className="mb-1 block">Refresco de Seller Orders (segundos, 15-300)</span>
        <input
          type="number"
          min={15}
          max={300}
          value={settings.sellerRefreshSeconds}
          disabled={saving}
          onChange={(e) =>
            setSettings({ ...settings, sellerRefreshSeconds: Number(e.target.value) })
          }
          onBlur={(e) => {
            const value = Math.max(15, Math.min(300, Number(e.target.value) || 15));
            save({ ...settings, sellerRefreshSeconds: value });
          }}
          className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
        />
      </label>

      {saved && <p className="text-xs text-emerald-600 dark:text-emerald-400">Guardado.</p>}
      <ErrorText message={error} />
    </div>
  );
}
