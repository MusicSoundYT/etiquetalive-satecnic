"use client";

import { useState } from "react";
import { buttonClass, ErrorText } from "@/components/auth-shell";

const AMOUNTS = [
  { cents: 500, label: "5€" },
  { cents: 1000, label: "10€" },
  { cents: 2000, label: "20€" },
  { cents: 5000, label: "50€" },
];

export function RechargeForm() {
  const [loadingAmount, setLoadingAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRecharge(amountCents: number) {
    setError(null);
    setLoadingAmount(amountCents);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar el pago.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoadingAmount(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {AMOUNTS.map((a) => (
          <button
            key={a.cents}
            onClick={() => handleRecharge(a.cents)}
            disabled={loadingAmount !== null}
            className={buttonClass}
          >
            {loadingAmount === a.cents ? "Redirigiendo..." : a.label}
          </button>
        ))}
      </div>
      <ErrorText message={error} />
    </div>
  );
}
