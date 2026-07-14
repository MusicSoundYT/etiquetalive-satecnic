import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getStripeClient } from "@/lib/stripe/client";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";

/** Prepara el guardado de una tarjeta (SetupIntent) para poder cobrar autorecargas sin intervención del usuario. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  try {
    const customerId = await getOrCreateStripeCustomer(user.id, user.email);
    const stripe = getStripeClient();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      metadata: { user_id: user.id },
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error("No se pudo crear el SetupIntent de Stripe:", err);
    return NextResponse.json(
      { error: "No se pudo iniciar el guardado de la tarjeta. Inténtalo más tarde." },
      { status: 503 }
    );
  }
}
