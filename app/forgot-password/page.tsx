"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell, FormField, inputClass, buttonClass, ErrorText } from "@/components/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo procesar la solicitud.");
        return;
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Recuperar contraseña" subtitle="Te enviaremos un enlace para restablecerla">
      {sent ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Si el email existe en nuestro sistema, recibirás instrucciones en breve. El enlace caduca
          en 10 minutos.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Email">
            <input
              type="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? "Enviando..." : "Enviar enlace"}
          </button>
          <ErrorText message={error} />
        </form>
      )}
      <div className="mt-6 text-sm">
        <Link href="/login" className="text-zinc-600 hover:underline dark:text-zinc-400">
          Volver a iniciar sesión
        </Link>
      </div>
    </AuthShell>
  );
}
