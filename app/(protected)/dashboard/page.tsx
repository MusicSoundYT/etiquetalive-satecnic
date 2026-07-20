import { Suspense } from "react";
import { requireSession } from "@/lib/auth/require-session";
import { OrdersTable } from "@/components/orders-table";
import { OrdersStatsCards } from "@/components/orders-stats";
import { OrdersFilterBar } from "@/components/orders-filter-bar";
import { getOrdersPage, getOrdersStats, ORDERS_PAGE_SIZE } from "@/lib/orders/list";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const user = await requireSession();
  const { page: pageParam, q, from, to, sort, dir } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const filter = { q, from, to, sort, dir: dir === "asc" ? ("asc" as const) : ("desc" as const) };

  const [{ orders, total }, stats] = await Promise.all([
    getOrdersPage(user.tenant_id!, page, filter),
    getOrdersStats(user.tenant_id!),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Pedidos</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Todos tus pedidos, sin límite.</p>
      </div>

      <OrdersStatsCards stats={stats} />

      <Suspense fallback={null}>
        <OrdersFilterBar>
          <OrdersTable orders={orders} total={total} page={page} pageSize={ORDERS_PAGE_SIZE} />
        </OrdersFilterBar>
      </Suspense>
    </div>
  );
}
