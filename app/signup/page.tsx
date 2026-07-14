"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell, FormField, inputClass, buttonClass, ErrorText } from "@/components/auth-shell";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(searchParams.get("ref") ?? "");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!acceptedTerms) {
      setError("Debes aceptar los Términos y la Política de Privacidad.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          lastName: lastName || undefined,
          email,
          password,
          referralCode: referralCode || undefined,
          acceptedTerms,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear la cuenta.");
        return;
      }
      router.push("/mfa");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Crear cuenta" subtitle="Empieza a usar Etiqueta Live">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nombre">
          <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Apellidos (opcional)">
          <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </FormField>
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
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Mínimo 6 caracteres, con mayúscula, minúscula y un carácter especial.
        </p>
        <FormField label="Código de referido (opcional)">
          <input
            className={inputClass}
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
          />
        </FormField>
        <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          <span>
            He leído y acepto los{" "}
            <Link href="/legal/terminos" target="_blank" className="underline">
              Términos y Condiciones
            </Link>{" "}
            y la{" "}
            <Link href="/legal/privacidad" target="_blank" className="underline">
              Política de Privacidad
            </Link>
            .
          </span>
        </label>
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </button>
        <ErrorText message={error} />
      </form>
      <div className="mt-6 text-sm">
        <Link href="/login" className="text-zinc-600 hover:underline dark:text-zinc-400">
          ¿Ya tienes cuenta? Inicia sesión
        </Link>
      </div>
    </AuthShell>
  );
}
