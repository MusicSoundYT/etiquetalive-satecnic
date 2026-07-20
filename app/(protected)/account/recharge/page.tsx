import { requireSession } from "@/lib/auth/require-session";
import { RechargeForm } from "@/components/recharge-form";
import { ReferralsPanel } from "@/components/referrals-panel";
import { AutoRechargePanel } from "@/components/auto-recharge-panel";
import { BillingHistoryPanel } from "@/components/billing-history-panel";
import { getUserBalance } from "@/lib/wallet/ledger";

export default async function RechargePage() {
  const user = await requireSession();
  const balance = await getUserBalance(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Renovación</h1>

        {balance?.is_demo && (
          <div className="mt-3 max-w-sm rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Tu cuenta está en modo DEMO: imprimir etiquetas no descuenta saldo real.
          </div>
        )}

        <div className="max-w-sm">
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Saldo disponible</div>
            <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {((balance?.balance_cents ?? 0) / 100).toFixed(2)}€
            </div>
          </div>

          <div className="mt-4">
            <RechargeForm />
          </div>
        </div>

        <div className="mt-6">
          <AutoRechargePanel
            hasPaymentMethod={Boolean(balance?.stripe_default_pm_id)}
            autoRechargeEnabled={balance?.auto_recharge_enabled ?? false}
            thresholdCents={balance?.auto_recharge_threshold_cents ?? 200}
            amountCents={balance?.auto_recharge_amount_cents ?? 500}
          />
        </div>

        <div className="mt-6">
          <BillingHistoryPanel />
        </div>
      </div>

      <ReferralsPanel userId={user.id} />
    </div>
  );
}
