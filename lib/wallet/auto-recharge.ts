import "server-only";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStripeClient } from "@/lib/stripe/client";

/**
 * Comprueba si el usuario necesita una autorecarga tras un cobro y, si toca,
 * la lanza. Solo CREA y confirma el PaymentIntent aquí — el saldo se acredita
 * exclusivamente en el webhook `payment_intent.succeeded` (single source of
 * verdad, evita cobrar bien pero acreditar dos veces si esta llamada y el
 * webhook se solapasen). No debe lanzar nunca: es un efecto secundario del
 * cobro de una etiqueta, un fallo aquí no puede tumbar esa petición.
 */
export async function maybeAutoRecharge(userId: string): Promise<void> {
  try {
    const { data: balance } = await supabaseAdmin
      .from("user_balances")
      .select(
        "balance_cents, auto_recharge_enabled, auto_recharge_threshold_cents, auto_recharge_amount_cents, stripe_customer_id, stripe_default_pm_id"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (!balance?.auto_recharge_enabled) return;
    if (!balance.stripe_customer_id || !balance.stripe_default_pm_id) return;
    if (balance.balance_cents >= balance.auto_recharge_threshold_cents) return;

    // Evita disparar una segunda autorecarga si ya hay una reciente en curso
    // (p. ej. dos impresiones concurrentes vaciando el saldo casi a la vez).
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recentAttempt } = await supabaseAdmin
      .from("balance_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "recharge")
      .contains("metadata", { kind: "auto_recharge" })
      .gte("created_at", twoMinutesAgo)
      .limit(1)
      .maybeSingle();
    if (recentAttempt) return;

    const stripe = getStripeClient();
    try {
      await stripe.paymentIntents.create({
        amount: balance.auto_recharge_amount_cents,
        currency: "eur",
        customer: balance.stripe_customer_id,
        payment_method: balance.stripe_default_pm_id,
        off_session: true,
        confirm: true,
        metadata: { user_id: userId, kind: "auto_recharge" },
      });
      // El acreditado del saldo llega vía webhook (payment_intent.succeeded).
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        // Tarjeta rechazada, requiere autenticación 3DS, etc.: no podemos
        // reintentar sin intervención del usuario, así que desactivamos la
        // autorecarga para no reintentar en bucle en cada impresión siguiente.
        await supabaseAdmin
          .from("user_balances")
          .update({ auto_recharge_enabled: false })
          .eq("user_id", userId);
      }
      console.error(`Autorecarga fallida para user ${userId}:`, err);
    }
  } catch (err) {
    console.error(`Error comprobando autorecarga para user ${userId}:`, err);
  }
}
