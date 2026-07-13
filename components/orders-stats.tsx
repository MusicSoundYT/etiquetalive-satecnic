import type { OrdersStats } from "@/lib/orders/list";

export function OrdersStatsCards({ stats }: { stats: OrdersStats }) {
  const cards: [string, number][] = [
    ["Total pedidos", stats.total],
    ["Impresos", stats.impresos],
    ["Pendientes", stats.pendientes],
    ["Reimpresiones", stats.reimpresiones],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(([label, value]) => (
        <div
          key={label}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</div>
        </div>
      ))}
    </div>
  );
}
