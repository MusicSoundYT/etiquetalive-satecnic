"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AuthShell, FormField, inputClass, buttonClass, ErrorText } from "@/components/auth-shell";

type Mode =
  | "loading"
  | "choose"
  | "setup-totp"
  | "setup-email"
  | "verify-totp"
  | "verify-email";

const RESEND_COOLDOWN_S = 30;

const secondaryButtonClass =
  "w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

export default function MfaPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/mfa/status");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo comprobar el estado de la verificación.");
        return;
      }
      if (!data.enrolled) {
        setMode("choose");
      } else if (data.method === "email") {
        setMode("verify-email");
        void sendEmailCode("/api/auth/mfa/verify-email/send");
      } else {
        setMode("verify-totp");
      }
    })();
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function startCooldown() {
    setResendCooldown(RESEND_COOLDOWN_S);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1 && cooldownRef.current) clearInterval(cooldownRef.current);
        return Math.max(0, s - 1);
      });
    }, 1000);
  }

  async function sendEmailCode(endpoint: string) {
    setError(null);
    const res = await fetch(endpoint, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo enviar el código.");
      return;
    }
    startCooldown();
  }

  async function startTotpSetup() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/setup-totp");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo generar el código QR.");
        return;
      }
      setQrDataUrl(data.qrDataUrl);
      setMode("setup-totp");
    } finally {
      setLoading(false);
    }
  }

  async function startEmailSetup() {
    setLoading(true);
    try {
      await sendEmailCode("/api/auth/mfa/setup-email/send");
      setMode("setup-email");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint =
        mode === "setup-totp"
          ? "/api/auth/mfa/setup-totp"
          : mode === "setup-email"
            ? "/api/auth/mfa/setup-email/confirm"
            : mode === "verify-email"
              ? "/api/auth/mfa/verify-email/confirm"
              : "/api/auth/mfa/verify";
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

  if (mode === "choose") {
    return (
      <AuthShell
        title="Configura la verificación en dos pasos"
        subtitle="Elige cómo quieres confirmar que eres tú cada vez que inicies sesión."
      >
        <div className="space-y-3">
          <button onClick={startTotpSetup} disabled={loading} className={buttonClass}>
            Código QR (Google Authenticator o similar)
          </button>
          <button onClick={startEmailSetup} disabled={loading} className={secondaryButtonClass}>
            Recibir el código por correo electrónico
          </button>
        </div>
        <ErrorText message={error} />
      </AuthShell>
    );
  }

  const isEmailMode = mode === "setup-email" || mode === "verify-email";

  return (
    <AuthShell
      title={mode.startsWith("setup") ? "Configura la verificación en dos pasos" : "Verificación en dos pasos"}
      subtitle={
        mode === "setup-totp"
          ? "Escanea este código QR con Google Authenticator (o similar) y confirma con el código generado."
          : isEmailMode
            ? "Te hemos enviado un código de 6 dígitos por correo electrónico. Caduca en 5 minutos."
            : "Introduce el código de tu app de autenticación."
      }
    >
      {mode === "setup-totp" && qrDataUrl && (
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
        {isEmailMode && (
          <button
            type="button"
            disabled={loading || resendCooldown > 0}
            onClick={() =>
              sendEmailCode(
                mode === "setup-email" ? "/api/auth/mfa/setup-email/send" : "/api/auth/mfa/verify-email/send"
              )
            }
            className={secondaryButtonClass}
          >
            {resendCooldown > 0 ? `Reenviar código (${resendCooldown}s)` : "Reenviar código"}
          </button>
        )}
        <ErrorText message={error} />
      </form>
    </AuthShell>
  );
}
