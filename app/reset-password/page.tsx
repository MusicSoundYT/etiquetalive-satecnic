"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AuthShell, FormField, inputClass, buttonClass, ErrorText } from "@/components/auth-shell";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!token) {
      setError("Enlace inválido.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo restablecer la contraseña.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Enlace inválido">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Este enlace de recuperación no es válido. Solicita uno nuevo desde la pantalla de inicio
          de sesión.
        </p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Contraseña actualizada">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Tu contraseña se ha cambiado correctamente. Redirigiendo al inicio de sesión…
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Elige una nueva contraseña">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nueva contraseña">
          <input
            type="password"
            required
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <FormField label="Repite la nueva contraseña">
          <input
            type="password"
            required
            className={inputClass}
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
        </FormField>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Mínimo 6 caracteres, con mayúscula, minúscula y un carácter especial.
        </p>
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Guardando..." : "Guardar contraseña"}
        </button>
        <ErrorText message={error} />
      </form>
    </AuthShell>
  );
}
