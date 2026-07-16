import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adjustBalance } from "@/lib/wallet/ledger";

const REFERRAL_BONUS_CENTS = 500;
const QUALIFYING_RECHARGE_CENTS = 500;

/**
 * Si el usuario que acaba de recargar fue invitado por un código de referido
 * y aún no se le ha acreditado el bono (referrals.status = 'pending'), y esta
 * recarga alcanza el mínimo de 5€: se le regala +5€ a él y se acreditan +5€ al
 * que le invitó, marcando el referral como 'paid'. Se guarda el payment_intent
 * de esta recarga concreta para poder revertir el bono si, y solo si, ESTA
 * recarga se reembolsa más adelante (una recarga posterior no debe afectar a
 * un bono ya ganado legítimamente).
 */
export async function processReferralOnRecharge(
  userId: string,
  rechargeAmountCents: number,
  stripePaymentIntentId?: string
): Promise<void> {
  if (rechargeAmountCents < QUALIFYING_RECHARGE_CENTS) return;

  const { data: referral } = await supabaseAdmin
    .from("referrals")
    .select("id, referrer_user_id")
    .eq("referred_user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (!referral) return;

  await adjustBalance(userId, REFERRAL_BONUS_CENTS, "promo_credit", {
    description: "Bono de bienvenida por código de referido",
    relatedReferralId: referral.id,
  });

  const { txId } = await adjustBalance(referral.referrer_user_id, REFERRAL_BONUS_CENTS, "referral_bonus", {
    description: "Bono por amigo invitado",
    relatedReferralId: referral.id,
  });

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("referrals")
    .update({
      status: "paid",
      referred_first_recharge_at: now,
      qualified_at: now,
      paid_at: now,
      referrer_bonus_tx_id: txId,
      qualifying_stripe_payment_intent_id: stripePaymentIntentId ?? null,
    })
    .eq("id", referral.id);
}

/**
 * Si la recarga que se acaba de reembolsar del todo fue la que originó un
 * bono de referido (localizada por su payment_intent, no por el usuario:
 * una recarga posterior del mismo usuario no debe verse afectada), se retira
 * el bono de 5€ tanto de la cuenta del invitado como de quien invitó.
 */
export async function reverseReferralBonusIfQualifying(stripePaymentIntentId: string): Promise<void> {
  const { data: referral } = await supabaseAdmin
    .from("referrals")
    .select("id, referrer_user_id, referred_user_id")
    .eq("qualifying_stripe_payment_intent_id", stripePaymentIntentId)
    .eq("status", "paid")
    .maybeSingle();

  if (!referral) return; // esta recarga no originó ningún bono, o ya se revirtió antes

  await adjustBalance(referral.referred_user_id, -REFERRAL_BONUS_CENTS, "refund", {
    description: "Reversión del bono de bienvenida (la recarga que lo originó fue reembolsada)",
    relatedReferralId: referral.id,
  });
  await adjustBalance(referral.referrer_user_id, -REFERRAL_BONUS_CENTS, "refund", {
    description: "Reversión del bono por amigo invitado (la recarga que lo originó fue reembolsada)",
    relatedReferralId: referral.id,
  });

  await supabaseAdmin.from("referrals").update({ status: "refunded" }).eq("id", referral.id);
}
