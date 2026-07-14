import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type BalanceTxType =
  | "recharge"
  | "label_consumption"
  | "referral_bonus"
  | "promo_credit"
  | "debt_settlement"
  | "refund"
  | "admin_credit"
  | "admin_debit";

export type AdjustBalanceOpts = {
  description?: string;
  stripePaymentIntentId?: string;
  relatedDetectionId?: string;
  relatedReferralId?: number;
  metadata?: Record<string, unknown>;
};

/** Mueve saldo de forma atómica (recarga, cobro de etiqueta, bono de referido...). */
export async function adjustBalance(
  userId: string,
  amountCents: number,
  type: BalanceTxType,
  opts: AdjustBalanceOpts = {}
): Promise<{ balanceAfterCents: number; txId: number }> {
  const { data, error } = await supabaseAdmin.rpc("adjust_balance", {
    p_user_id: userId,
    p_amount_cents: amountCents,
    p_type: type,
    p_description: opts.description ?? null,
    p_stripe_payment_intent_id: opts.stripePaymentIntentId ?? null,
    p_related_detection_id: opts.relatedDetectionId ?? null,
    p_related_referral_id: opts.relatedReferralId ?? null,
    p_metadata: opts.metadata ?? null,
  });

  if (error || !data || data.length === 0) {
    throw new Error(`No se pudo ajustar el saldo: ${error?.message}`);
  }

  return { balanceAfterCents: data[0].balance_after_cents, txId: data[0].tx_id };
}

export async function getPriceCentsForTier(tier: number): Promise<number> {
  const { data } = await supabaseAdmin
    .from("pricing_tiers")
    .select("price_cents")
    .eq("tier", tier)
    .maybeSingle();
  return data?.price_cents ?? 10;
}

export async function getUserBalance(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_balances")
    .select(
      "balance_cents, current_tier, is_blocked, block_reason, auto_recharge_enabled, auto_recharge_threshold_cents, auto_recharge_amount_cents, stripe_default_pm_id"
    )
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}
