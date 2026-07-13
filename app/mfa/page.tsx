"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AuthShell, FormField, inputClass, buttonClass, ErrorText } from "@/components/auth-shell";

type Mode = "loading" | "setup" | "verify";

export default function MfaPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/mfa/setup");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setQrDataUrl(data.qrDataUrl);
        setMode("setup");
      } else {
        // MFA ya activada para esta cuenta: solo pedir el código.
        setMode("verify");
      }
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === "setup" ? "/api/auth/mfa/setup" : "/api/auth/mfa/verify";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Código incorrecto.");
        return;
      }
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "loading") {
    return (
      <AuthShell title="Verificación en dos pasos">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={mode === "setup" ? "Configura la verificación en dos pasos" : "Verificación en dos pasos"}
      subtitle={
        mode === "setup"
          ? "Escanea este código QR con Google Authenticator (o similar) y confirma con el código generado."
          : "Introduce el código de tu app de autenticación."
      }
    >
      {mode === "setup" && qrDataUrl && (
        <div className="mb-6 flex justify-center rounded-lg bg-white p-4">
          <Image src={qrDataUrl} alt="Código QR de MFA" width={200} height={200} unoptimized />
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Código de 6 dígitos">
          <input
            required
            maxLength={6}
            inputMode="numeric"
            className={inputClass}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </FormField>
        <button type="submit" disabled={loading || code.length !== 6} className={buttonClass}>
          {loading ? "Verificando..." : "Confirmar"}
        </button>
        <ErrorText message={error} />
      </form>
    </AuthShell>
  );
}
