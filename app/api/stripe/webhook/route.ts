import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe/client";
import { requireStripeEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adjustBalance } from "@/lib/wallet/ledger";
import { processReferralOnRecharge, reverseReferralBonusIfQualifying } from "@/lib/referrals/process-recharge";
import type Stripe from "stripe";

// Necesario para poder verificar la firma sobre el body crudo.
export const runtime = "nodejs";

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "payment" || session.payment_status !== "paid") return;

  const userId = session.metadata?.user_id;
  const amountCents = session.amount_total;
  if (!userId || !amountCents) return;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : undefined;

  const { balanceAfterCents } = await adjustBalance(userId, amountCents, "recharge", {
    description: "Recarga de saldo",
    stripePaymentIntentId: paymentIntentId,
  });

  // Recarga con éxito: si venía de un aviso de saldo negativo, se resetea
  // para que un futuro episodio vuelva a notificar.
  await supabaseAdmin
    .from("user_balances")
    .update({ low_balance_notified_at: null })
    .eq("user_id", userId);

  await supabaseAdmin.from("stripe_events").update({ related_user_id: userId }).eq("event_id", event.id);

  await processReferralOnRecharge(userId, amountCents, paymentIntentId);

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

  await supabaseAdmin
    .from("user_balances")
    .update({ low_balance_notified_at: null })
    .eq("user_id", userId);

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

/**
 * Cuando se reembolsa (total o parcialmente) una recarga de saldo, se
 * descuenta automáticamente el importe reembolsado del saldo del cliente —
 * si no, el reembolso queda invisible para nosotros y el cliente se queda
 * con saldo que ya no ha pagado. "charge.amount_refunded" es ACUMULADO (la
 * suma de todos los reembolsos de ese cobro hasta ahora), así que se calcula
 * solo la parte NUEVA respecto a lo que ya se hubiera aplicado antes, para
 * que reembolsos parciales sucesivos o reintentos del webhook no descuenten
 * de más.
 */
async function handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  const totalRefundedCents = charge.amount_refunded;
  if (!paymentIntentId || !totalRefundedCents) return;

  // Solo nos interesan los cobros que fueron una recarga de saldo (no
  // cualquier otro cobro de Stripe que pudiera existir en el futuro).
  const { data: originalTx } = await supabaseAdmin
    .from("balance_transactions")
    .select("user_id, amount_cents")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("type", "recharge")
    .maybeSingle();
  if (!originalTx) return;

  const { data: previousRefunds } = await supabaseAdmin
    .from("balance_transactions")
    .select("amount_cents")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("type", "refund");
  const alreadyRefundedCents = (previousRefunds ?? []).reduce((sum, r) => sum + Math.abs(r.amount_cents), 0);

  const newlyRefundedCents = totalRefundedCents - alreadyRefundedCents;
  if (newlyRefundedCents <= 0) return; // ya aplicado (reintento del webhook)

  await adjustBalance(originalTx.user_id, -newlyRefundedCents, "refund", {
    description: "Reembolso en Stripe de una recarga de saldo",
    stripePaymentIntentId: paymentIntentId,
  });

  await supabaseAdmin.from("stripe_events").update({ related_user_id: originalTx.user_id }).eq("event_id", event.id);

  // Si esta recarga concreta queda reembolsada del TODO (no un reembolso
  // parcial) y fue la que originó un bono de referido, se retira también el
  // bono — nunca por una recarga posterior del mismo usuario.
  if (totalRefundedCents >= originalTx.amount_cents) {
    await reverseReferralBonusIfQualifying(paymentIntentId);
  }
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
    if (insertError.code === "23505") {
      // Conflicto de PK (event_id ya existe) = evento repetido, se responde 200 sin reprocesar.
      return NextResponse.json({ status: "duplicate" });
    }
    // Cualquier OTRO error (p. ej. un corte puntual de conexión con la BD) no es
    // un duplicado real: si respondiéramos 200 aquí, Stripe daría el evento por
    // entregado y nunca lo reintentaría, perdiendo esa recarga para siempre.
    console.error("Error guardando el evento de Stripe (se pide reintento):", insertError);
    return NextResponse.json({ error: "No se pudo registrar el evento." }, { status: 500 });
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
    } else if (event.type === "charge.refunded") {
      await handleChargeRefunded(event);
    }
    await supabaseAdmin
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);
  } catch (err) {
    console.error(`Error procesando el evento de Stripe ${event.id} (${event.type}):`, err);
    await supabaseAdmin
      .from("stripe_events")
      .update({ processing_error: (err as Error).message })
      .eq("event_id", event.id);
    return NextResponse.json({ error: "Error procesando el evento." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
