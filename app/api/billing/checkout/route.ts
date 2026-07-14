import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getStripeClient } from "@/lib/stripe/client";
import { env } from "@/lib/env";

const ALLOWED_AMOUNTS_CENTS = [500, 1000, 2000, 5000];

const bodySchema = z.object({
  amountCents: z.number().int().refine((v) => ALLOWED_AMOUNTS_CENTS.includes(v), {
    message: "Importe de recarga no permitido.",
  }),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  let session;
  try {
    const stripe = getStripeClient();
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: "Recarga de saldo Etiqueta Live" },
            unit_amount: parsed.data.amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: { user_id: user.id },
      success_url: `${env.appUrl}/account/recharge?status=success`,
      cancel_url: `${env.appUrl}/account/recharge?status=cancelled`,
    });
  } catch (err) {
    console.error("No se pudo crear la sesión de pago de Stripe:", err);
    return NextResponse.json(
      { error: "Los pagos no están disponibles todavía. Inténtalo más tarde." },
      { status: 503 }
    );
  }

  return NextResponse.json({ url: session.url });
}
