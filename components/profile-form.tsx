"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormField, inputClass, buttonClass, ErrorText } from "@/components/auth-shell";

export function ProfileForm({
  initialName,
  initialLastName,
  initialEmail,
}: {
  initialName: string;
  initialLastName: string;
  initialEmail: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [lastName, setLastName] = useState(initialLastName);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lastName: lastName || undefined, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo actualizar el perfil.");
        return;
      }
      setSuccess(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <FormField label="Nombre">
        <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Apellidos">
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
      <button type="submit" disabled={loading} className={buttonClass}>
        {loading ? "Guardando..." : "Guardar cambios"}
      </button>
      <ErrorText message={error} />
      {success && <p className="mt-3 text-sm text-green-600 dark:text-green-400">Perfil actualizado.</p>}
    </form>
  );
}
