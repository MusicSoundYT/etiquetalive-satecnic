import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adjustBalance } from "@/lib/wallet/ledger";

const REFERRAL_BONUS_CENTS = 500;
const QUALIFYING_RECHARGE_CENTS = 500;

/**
 * Si el usuario que acaba de recargar fue invitado por un código de referido
 * y aún no se le ha acreditado el bono (referrals.status = 'pending'), y esta
 * recarga alcanza el mínimo de 5€: se le regala +5€ a él y se acreditan +5€ al
 * que le invitó, marcando el referral como 'paid'.
 */
export async function processReferralOnRecharge(userId: string, rechargeAmountCents: number): Promise<void> {
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
    })
    .eq("id", referral.id);
}
