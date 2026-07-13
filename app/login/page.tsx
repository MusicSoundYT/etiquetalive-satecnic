"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell, FormField, inputClass, buttonClass, ErrorText } from "@/components/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar sesión.");
        return;
      }
      router.push("/mfa");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Iniciar sesión" subtitle="Accede a tu cuenta de Etiqueta Live">
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
        <FormField label="Contraseña">
          <input
            type="password"
            required
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
        <ErrorText message={error} />
      </form>
      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/signup" className="text-zinc-600 hover:underline dark:text-zinc-400">
          Crear cuenta
        </Link>
        <Link href="/forgot-password" className="text-zinc-600 hover:underline dark:text-zinc-400">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    </AuthShell>
  );
}
