"use client";

import { useState } from "react";
import { buttonClass, ErrorText } from "@/components/auth-shell";

const AMOUNTS = [
  { cents: 500, label: "5€" },
  { cents: 1000, label: "10€" },
  { cents: 2000, label: "20€" },
  { cents: 5000, label: "50€" },
];

// Deben coincidir con MIN_AMOUNT_CENTS/MAX_AMOUNT_CENTS en
// app/api/billing/checkout/route.ts — se repiten aquí solo para poder avisar
// al momento en el formulario, sin esperar a la respuesta del servidor.
const MIN_CUSTOM_CENTS = 100;
const MAX_CUSTOM_CENTS = 200000;

export function RechargeForm() {
  const [loadingAmount, setLoadingAmount] = useState<number | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const anyLoading = loadingAmount !== null || customLoading;

  async function handleRecharge(amountCents: number, isCustom = false) {
    setError(null);
    if (isCustom) setCustomLoading(true);
    else setLoadingAmount(amountCents);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "No se pudo iniciar el pago.");
        return;
      }
      window.location.href = data.url;
    } finally {
      if (isCustom) setCustomLoading(false);
      else setLoadingAmount(null);
    }
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Acepta coma o punto decimal ("100" o "100,50").
    const euros = Number(customAmount.replace(",", "."));
    if (!Number.isFinite(euros) || euros <= 0) {
      setError("Introduce un importe válido.");
      return;
    }
    const cents = Math.round(euros * 100);
    if (cents < MIN_CUSTOM_CENTS || cents > MAX_CUSTOM_CENTS) {
      setError(
        `El importe debe estar entre ${(MIN_CUSTOM_CENTS / 100).toFixed(2)}€ y ${(MAX_CUSTOM_CENTS / 100).toFixed(2)}€.`
      );
      return;
    }
    handleRecharge(cents, true);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {AMOUNTS.map((a) => (
          <button
            key={a.cents}
            onClick={() => handleRecharge(a.cents)}
            disabled={anyLoading}
            className={buttonClass}
          >
            {loadingAmount === a.cents ? "Redirigiendo..." : a.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleCustomSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="custom-amount" className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
            Otro importe (€)
          </label>
          <input
            id="custom-amount"
            type="text"
            inputMode="decimal"
            placeholder="p. ej. 100"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            disabled={anyLoading}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
        </div>
        <button
          type="submit"
          disabled={anyLoading || !customAmount}
          className={`${buttonClass} sm:w-auto sm:px-6`}
        >
          {customLoading ? "Redirigiendo..." : "Recargar"}
        </button>
      </form>

      <ErrorText message={error} />
    </div>
  );
}
