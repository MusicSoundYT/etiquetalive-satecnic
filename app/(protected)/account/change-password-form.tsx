"use client";

import { useState } from "react";
import { FormField, inputClass, buttonClass, ErrorText } from "@/components/auth-shell";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== newPassword2) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo cambiar la contraseña.");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <FormField label="Contraseña actual">
        <input
          type="password"
          required
          className={inputClass}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </FormField>
      <FormField label="Nueva contraseña">
        <input
          type="password"
          required
          className={inputClass}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </FormField>
      <FormField label="Repite la nueva contraseña">
        <input
          type="password"
          required
          className={inputClass}
          value={newPassword2}
          onChange={(e) => setNewPassword2(e.target.value)}
        />
      </FormField>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Mínimo 6 caracteres, con mayúscula, minúscula y un carácter especial.
      </p>
      <button type="submit" disabled={loading} className={buttonClass}>
        {loading ? "Guardando..." : "Cambiar contraseña"}
      </button>
      <ErrorText message={error} />
      {success && <p className="mt-3 text-sm text-green-600 dark:text-green-400">Contraseña actualizada.</p>}
    </form>
  );
}
