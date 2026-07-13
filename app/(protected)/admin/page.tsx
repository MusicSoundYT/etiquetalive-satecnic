import { requireAdminSession } from "@/lib/auth/require-session";
import { AdminUsersTable } from "@/components/admin-users-table";
import { AdminPricingTiers } from "@/components/admin-pricing-tiers";

export default async function AdminPage() {
  await requireAdminSession();

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Administración</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Clientes, rangos y precios.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Rangos de precio</h2>
        <AdminPricingTiers />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Clientes</h2>
        <AdminUsersTable />
      </section>
    </div>
  );
}
