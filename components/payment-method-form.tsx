"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { buttonClass, ErrorText } from "@/components/auth-shell";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function InnerForm({ onSaved }: { onSaved: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setLoading(true);
    try {
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });
      if (confirmError || !setupIntent) {
        setError(confirmError?.message ?? "No se pudo guardar la tarjeta.");
        return;
      }

      const res = await fetch("/api/billing/payment-method/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupIntentId: setupIntent.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "No se pudo guardar la tarjeta.");
        return;
      }
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PaymentElement />
      <button type="submit" disabled={!stripe || loading} className={buttonClass}>
        {loading ? "Guardando…" : "Guardar tarjeta"}
      </button>
      <ErrorText message={error} />
    </form>
  );
}

/** Formulario de Stripe Elements para guardar una tarjeta como método de cobro por defecto (autorecarga). */
export function PaymentMethodForm({ onSaved }: { onSaved: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/setup-intent", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.clientSecret) setClientSecret(data.clientSecret);
        else setError(data.error ?? "No se pudo iniciar el guardado de la tarjeta.");
      })
      .catch(() => setError("No se pudo iniciar el guardado de la tarjeta."));
  }, []);

  if (!stripePromise) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Stripe no está configurado en este entorno todavía.
      </p>
    );
  }
  if (error) return <ErrorText message={error} />;
  if (!clientSecret) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <InnerForm onSaved={onSaved} />
    </Elements>
  );
}
