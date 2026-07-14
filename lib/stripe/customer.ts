import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStripeClient } from "@/lib/stripe/client";

/** Devuelve el stripe_customer_id del usuario, creando el Customer en Stripe si aún no existe. */
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const { data: balance } = await supabaseAdmin
    .from("user_balances")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (balance?.stripe_customer_id) return balance.stripe_customer_id;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({ email, metadata: { user_id: userId } });

  await supabaseAdmin
    .from("user_balances")
    .update({ stripe_customer_id: customer.id })
    .eq("user_id", userId);

  return customer.id;
}
