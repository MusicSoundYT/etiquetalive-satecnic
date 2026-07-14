"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/auth-shell";
import { PaymentMethodForm } from "@/components/payment-method-form";

export function AutoRechargePanel({
  hasPaymentMethod,
  autoRechargeEnabled,
  thresholdCents,
  amountCents,
}: {
  hasPaymentMethod: boolean;
  autoRechargeEnabled: boolean;
  thresholdCents: number;
  amountCents: number;
}) {
  const router = useRouter();
  const [showCardForm, setShowCardForm] = useState(false);
  const [enabled, setEnabled] = useState(autoRechargeEnabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(next: boolean) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/billing/auto-recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "No se pudo actualizar la autorecarga.");
        return;
      }
      setEnabled(next);
    } finally {
      setLoading(false);
    }
  }

  function handleCardSaved() {
    setShowCardForm(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Autorecarga</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Cuando tu saldo baje de {(thresholdCents / 100).toFixed(2)}€, te recargaremos{" "}
        {(amountCents / 100).toFixed(2)}€ automáticamente con la tarjeta guardada.
      </p>

      {!hasPaymentMethod && !showCardForm && (
        <button
          onClick={() => setShowCardForm(true)}
          className="mt-3 rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Añadir tarjeta
        </button>
      )}

      {showCardForm && (
        <div className="mt-3">
          <PaymentMethodForm onSaved={handleCardSaved} />
        </div>
      )}

      {hasPaymentMethod && !showCardForm && (
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={enabled}
              disabled={loading}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            Activar autorecarga
          </label>
          <button
            onClick={() => setShowCardForm(true)}
            className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cambiar tarjeta
          </button>
        </div>
      )}

      <ErrorText message={error} />
    </div>
  );
}
