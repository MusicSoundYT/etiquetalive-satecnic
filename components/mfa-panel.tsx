"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormField, inputClass, buttonClass, ErrorText } from "@/components/auth-shell";

const METHOD_LABELS: Record<string, string> = {
  totp: "app de autenticación (código QR)",
  email: "correo electrónico",
};

export function MfaPanel({ method }: { method: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/account/mfa/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo restablecer.");
        return;
      }
      router.push("/mfa");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Verificación activada por {method ? (METHOD_LABELS[method] ?? method) : "método desconocido"}.
      </p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cambiar método
        </button>
      ) : (
        <form onSubmit={handleReset} className="mt-3 space-y-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Confirma tu contraseña para restablecer la verificación en dos pasos. Se cerrará la sesión en
            todos tus dispositivos y a continuación podrás configurar el nuevo método.
          </p>
          <FormField label="Contraseña">
            <input
              type="password"
              required
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className={buttonClass}>
              {loading ? "Restableciendo..." : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setPassword("");
                setError(null);
              }}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
          </div>
          <ErrorText message={error} />
        </form>
      )}
    </div>
  );
}
