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
