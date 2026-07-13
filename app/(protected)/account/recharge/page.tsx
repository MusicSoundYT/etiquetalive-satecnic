import { requireSession } from "@/lib/auth/require-session";
import { RechargeForm } from "@/components/recharge-form";
import { ReferralsPanel } from "@/components/referrals-panel";
import { getUserBalance } from "@/lib/wallet/ledger";

export default async function RechargePage() {
  const user = await requireSession();
  const balance = await getUserBalance(user.id);

  return (
    <div className="mx-auto max-w-md space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Renovación</h1>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Saldo disponible</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {((balance?.balance_cents ?? 0) / 100).toFixed(2)}€
          </div>
        </div>

        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Elige un importe. Se descontará de tu saldo el precio por etiqueta según tu rango.
        </p>
        <div className="mt-6">
          <RechargeForm />
        </div>
      </div>

      <ReferralsPanel userId={user.id} />
    </div>
  );
}
