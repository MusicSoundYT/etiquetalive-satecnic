import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getStripeClient } from "@/lib/stripe/client";
import { env } from "@/lib/env";

// Antes solo se permitían los 4 importes fijos del formulario (5/10/20/50€).
// RechargeForm añadió un campo para escribir un importe a mano, así que aquí
// se cambia a un rango — 1€ de mínimo (Stripe ya exige 0,50€ para EUR, se
// deja algo de margen) y 2000€ de máximo, para frenar un error de escritura
// (p. ej. un cero de más) sin limitar un uso legítimo real.
const MIN_AMOUNT_CENTS = 100;
const MAX_AMOUNT_CENTS = 200000;

const bodySchema = z.object({
  amountCents: z
    .number()
    .int()
    .min(MIN_AMOUNT_CENTS, "Importe mínimo: 1€.")
    .max(MAX_AMOUNT_CENTS, "Importe máximo: 2000€."),
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
