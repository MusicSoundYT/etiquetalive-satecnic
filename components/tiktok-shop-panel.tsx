"use client";

import { useEffect, useState } from "react";
import { buttonClass, ErrorText } from "@/components/auth-shell";

type Shop = {
  id: string;
  shop_id: string;
  shop_name: string | null;
  region: string | null;
  shop_code: string | null;
};

type Connection = {
  seller_name: string | null;
  seller_base_region: string | null;
} | null;

const STATUS_MESSAGES: Record<string, { tone: "ok" | "err"; text: string }> = {
  connected: { tone: "ok", text: "Conectado con TikTok Shop correctamente." },
  denied: { tone: "err", text: "Autorización cancelada o denegada en TikTok." },
  invalid_state: { tone: "err", text: "La autorización no se pudo verificar. Inténtalo de nuevo." },
  error: { tone: "err", text: "No se pudo completar la conexión con TikTok Shop." },
};

export function TikTokShopPanel({
  connection,
  shops,
  initialStatus,
  hasAppCredentials,
}: {
  connection: Connection;
  shops: Shop[];
  initialStatus?: string;
  hasAppCredentials: boolean;
}) {
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [savedCredentials, setSavedCredentials] = useState(hasAppCredentials);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    shops: { shop: string; totalCount: number | null; orders: Record<string, unknown>[] }[];
  } | null>(null);
  const [webhookActive, setWebhookActive] = useState<boolean | null>(null);
  const [registering, setRegistering] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  const statusMsg = initialStatus ? STATUS_MESSAGES[initialStatus] : null;

  useEffect(() => {
    setTimeout(() => setRedirectUri(`${window.location.origin}/api/tiktok/oauth/callback`), 0);
    if (!connection) return;
    fetch("/api/tiktok/register-webhook")
      .then((res) => res.json())
      .then((data) => setWebhookActive(Boolean(data.active)))
      .catch(() => setWebhookActive(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setSavingCredentials(true);
    setCredentialsError(null);
    try {
      const res = await fetch("/api/tiktok/app-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKey, appSecret, serviceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCredentialsError(data.error ?? "No se pudieron guardar las credenciales.");
        return;
      }
      setSavedCredentials(true);
      setAppSecret("");
    } finally {
      setSavingCredentials(false);
    }
  }

  async function handleRegisterWebhook() {
    setRegistering(true);
    setWebhookError(null);
    try {
      const res = await fetch("/api/tiktok/register-webhook", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setWebhookError(data.error ?? "No se pudo activar la impresión automática.");
        return;
      }
      setWebhookActive(true);
    } finally {
      setRegistering(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("¿Desconectar TikTok Shop? Tendrás que volver a autorizar la app para reconectarlo.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/tiktok/disconnect", { method: "POST" });
      window.location.href = "/account";
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/tiktok/test-orders");
      const data = await res.json();
      if (!res.ok) {
        setTestError(data.error ?? "No se pudo consultar los pedidos.");
        return;
      }
      setTestResult(data);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      {statusMsg && (
        <p
          className={`text-sm ${
            statusMsg.tone === "ok"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {statusMsg.text}
        </p>
      )}

      {!connection && (
        <div className="max-w-sm space-y-3">
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Cada cuenta usa su propia app de TikTok Shop (Partner Center → Aplicaciones y servicios
              → Crear aplicación → Servicio personalizado). Pega aquí sus datos:
            </p>

            <label className="mb-2 block text-xs text-zinc-500 dark:text-zinc-400">
              URL de redirección (pégala en TikTok tal cual)
              <input
                readOnly
                value={redirectUri}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-1 w-full rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
              />
            </label>

            {savedCredentials ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  ✅ Credenciales de la app guardadas.
                </span>
                <button
                  type="button"
                  onClick={() => setSavedCredentials(false)}
                  className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveCredentials} className="space-y-2">
                <input
                  required
                  placeholder="App Key"
                  value={appKey}
                  onChange={(e) => setAppKey(e.target.value)}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <input
                  required
                  type="password"
                  placeholder="App Secret"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <input
                  required
                  placeholder="Service ID"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button type="submit" disabled={savingCredentials} className={`${buttonClass} w-auto px-4`}>
                  {savingCredentials ? "Guardando…" : "Guardar credenciales"}
                </button>
                <ErrorText message={credentialsError} />
              </form>
            )}
          </div>

          {savedCredentials && (
            <a href="/api/tiktok/oauth/start" className={`${buttonClass} inline-block w-auto px-4 text-center`}>
              Conectar con TikTok Shop
            </a>
          )}
        </div>
      )}

      {connection && (
        <div className="space-y-3">
          <div className="max-w-sm rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="font-medium text-zinc-900 dark:text-zinc-50">
              ✅ Conectado{connection.seller_name ? ` — ${connection.seller_name}` : ""}
            </div>
            {connection.seller_base_region && (
              <div className="text-xs text-zinc-400 dark:text-zinc-500">
                Región: {connection.seller_base_region}
              </div>
            )}
            {shops.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                {shops.map((s) => (
                  <li key={s.id}>
                    🏬 {s.shop_name || s.shop_code || s.shop_id} {s.region ? `(${s.region})` : ""}
                  </li>
                ))}
              </ul>
            )}
            {!shops.length && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                No se ha detectado ninguna tienda autorizada todavía.
              </p>
            )}
            <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              {webhookActive === null && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Comprobando impresión automática…</p>
              )}
              {webhookActive === true && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  🟢 Impresión automática por API activa: los pedidos de subasta se cobran solos en
                  cuanto TikTok los notifica.
                </p>
              )}
              {webhookActive === false && (
                <div>
                  <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                    La impresión automática por API no está activada todavía.
                  </p>
                  <button
                    onClick={handleRegisterWebhook}
                    disabled={registering}
                    className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {registering ? "Activando…" : "Activar impresión automática"}
                  </button>
                  <ErrorText message={webhookError} />
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleTest} disabled={testing} className={`${buttonClass} w-auto px-4`}>
              {testing ? "Consultando…" : "Ver pedidos de prueba"}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              {disconnecting ? "…" : "Desconectar"}
            </button>
          </div>

          <ErrorText message={testError} />

          {testResult && (
            <div className="space-y-3">
              {testResult.shops.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="mb-2 font-medium text-zinc-900 dark:text-zinc-50">
                    {s.shop} — {s.orders.length} pedido(s) recibido(s)
                    {s.totalCount !== null ? ` de ${s.totalCount} en total` : ""}
                  </div>
                  <pre className="max-h-96 overflow-auto rounded bg-zinc-50 p-2 text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                    {JSON.stringify(s.orders, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
