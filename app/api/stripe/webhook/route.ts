import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe/client";
import { requireStripeEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adjustBalance } from "@/lib/wallet/ledger";
import { processReferralOnRecharge } from "@/lib/referrals/process-recharge";
import type Stripe from "stripe";

// Necesario para poder verificar la firma sobre el body crudo.
export const runtime = "nodejs";

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "payment" || session.payment_status !== "paid") return;

  const userId = session.metadata?.user_id;
  const amountCents = session.amount_total;
  if (!userId || !amountCents) return;

  const { balanceAfterCents } = await adjustBalance(userId, amountCents, "recharge", {
    description: "Recarga de saldo",
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : undefined,
  });

  await supabaseAdmin.from("stripe_events").update({ related_user_id: userId }).eq("event_id", event.id);

  await processReferralOnRecharge(userId, amountCents);

  return balanceAfterCents;
}

/**
 * Única vía por la que se acredita el saldo de una autorecarga: el
 * PaymentIntent se crea y confirma en lib/wallet/auto-recharge.ts, pero el
 * saldo solo se toca aquí — evita acreditar dos veces si esa llamada síncrona
 * y este webhook llegaran a solaparse.
 */
async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const intent = event.data.object as Stripe.PaymentIntent;
  if (intent.metadata?.kind !== "auto_recharge") return;

  const userId = intent.metadata.user_id;
  if (!userId) return;

  await adjustBalance(userId, intent.amount, "recharge", {
    description: "Autorecarga de saldo",
    stripePaymentIntentId: intent.id,
  });

  await supabaseAdmin.from("stripe_events").update({ related_user_id: userId }).eq("event_id", event.id);
}

/** Si la autorecarga falla (tarjeta rechazada, requiere 3DS...), se desactiva para no reintentar en bucle. */
async function handlePaymentIntentFailed(event: Stripe.Event) {
  const intent = event.data.object as Stripe.PaymentIntent;
  if (intent.metadata?.kind !== "auto_recharge") return;

  const userId = intent.metadata.user_id;
  if (!userId) return;

  await supabaseAdmin.from("user_balances").update({ auto_recharge_enabled: false }).eq("user_id", userId);
  await supabaseAdmin.from("stripe_events").update({ related_user_id: userId }).eq("event_id", event.id);
}

/** Red de seguridad: guarda la tarjeta por si la llamada síncrona a /api/billing/payment-method/confirm no llegó a completarse. */
async function handleSetupIntentSucceeded(event: Stripe.Event) {
  const intent = event.data.object as Stripe.SetupIntent;
  const userId = intent.metadata?.user_id;
  if (!userId || !intent.payment_method) return;

  const paymentMethodId =
    typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method.id;
  const customerId = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;

  await supabaseAdmin
    .from("user_balances")
    .update({ stripe_default_pm_id: paymentMethodId })
    .eq("user_id", userId);

  const { data: existingPm } = await supabaseAdmin
    .from("payment_methods")
    .select("id")
    .eq("provider_payment_method_id", paymentMethodId)
    .maybeSingle();

  if (!existingPm) {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    await supabaseAdmin.from("payment_methods").insert({
      tenant_id: user?.tenant_id ?? null,
      provider: "stripe",
      provider_customer_id: customerId ?? null,
      provider_payment_method_id: paymentMethodId,
      status: "active",
    });
  }

  await supabaseAdmin.from("stripe_events").update({ related_user_id: userId }).eq("event_id", event.id);
}

export async function POST(req: NextRequest) {
  const { webhookSecret } = requireStripeEnv(); // sin esto, no se procesa NADA (nunca en claro)
  const stripe = getStripeClient();

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("Falta stripe-signature");
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: `Firma inválida: ${(err as Error).message}` }, { status: 400 });
  }

  // Idempotencia: si ya procesamos este event_id, no repetir efectos (recarga doble).
  const { error: insertError } = await supabaseAdmin
    .from("stripe_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
    });

  if (insertError) {
    // Conflicto de PK (event_id ya existe) = evento repetido, se responde 200 sin reprocesar.
    return NextResponse.json({ status: "duplicate" });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event);
    } else if (event.type === "payment_intent.succeeded") {
      await handlePaymentIntentSucceeded(event);
    } else if (event.type === "payment_intent.payment_failed") {
      await handlePaymentIntentFailed(event);
    } else if (event.type === "setup_intent.succeeded") {
      await handleSetupIntentSucceeded(event);
    }
    await supabaseAdmin
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);
  } catch (err) {
    await supabaseAdmin
      .from("stripe_events")
      .update({ processing_error: (err as Error).message })
      .eq("event_id", event.id);
    return NextResponse.json({ error: "Error procesando el evento." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
