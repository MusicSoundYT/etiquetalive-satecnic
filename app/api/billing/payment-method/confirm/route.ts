import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getStripeClient } from "@/lib/stripe/client";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({ setupIntentId: z.string().trim().min(1) });

/**
 * El cliente llama aquí justo después de que Stripe.js confirme el SetupIntent
 * en el navegador. Se vuelve a comprobar el estado directamente contra Stripe
 * (nunca nos fiamos de lo que diga el navegador) antes de guardar la tarjeta
 * como método de cobro por defecto. El webhook `setup_intent.succeeded` hace
 * lo mismo como red de seguridad si esta llamada no llega a completarse.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  try {
    const stripe = getStripeClient();
    const setupIntent = await stripe.setupIntents.retrieve(parsed.data.setupIntentId);

    if (setupIntent.metadata?.user_id !== user.id) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }
    if (setupIntent.status !== "succeeded" || !setupIntent.payment_method) {
      return NextResponse.json({ error: "La tarjeta no se pudo confirmar." }, { status: 400 });
    }

    const paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method.id;
    const customerId =
      typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id;

    await supabaseAdmin
      .from("user_balances")
      .update({ stripe_default_pm_id: paymentMethodId })
      .eq("user_id", user.id);

    // No hay constraint única garantizada sobre provider_payment_method_id en el
    // esquema actual, así que comprobamos y actualizamos/insertamos a mano en
    // vez de usar upsert con onConflict.
    const { data: existingPm } = await supabaseAdmin
      .from("payment_methods")
      .select("id")
      .eq("provider_payment_method_id", paymentMethodId)
      .maybeSingle();

    if (existingPm) {
      await supabaseAdmin
        .from("payment_methods")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", existingPm.id);
    } else {
      await supabaseAdmin.from("payment_methods").insert({
        tenant_id: user.tenant_id,
        provider: "stripe",
        provider_customer_id: customerId ?? null,
        provider_payment_method_id: paymentMethodId,
        status: "active",
      });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("No se pudo confirmar el método de pago:", err);
    return NextResponse.json({ error: "No se pudo guardar la tarjeta." }, { status: 500 });
  }
}
