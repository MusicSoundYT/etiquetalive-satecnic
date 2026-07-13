import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LabelPreview } from "@/components/label-preview";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession();

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenant_id)
    .maybeSingle();

  if (!order) notFound();

  const rows: [string, string][] = [
    ["TK", order.tk],
    ["Cliente", order.cliente ?? "—"],
    ["Precio", `${(order.precio_cents / 100).toFixed(2)} ${order.moneda}`],
    ["Fecha del pedido", order.fecha_pedido ? new Date(order.fecha_pedido).toLocaleString() : "—"],
    ["Detectado el", new Date(order.fecha_detectado).toLocaleString()],
    ["Estado", order.estado_impresion],
    ["Reimpresiones", String(order.reimpresiones)],
    ["Notas", order.notes ?? "—"],
  ];

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← Volver a pedidos
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Pedido {order.tk}</h1>
      <dl className="mt-6 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between px-4 py-3 text-sm">
            <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
            <dd className="text-zinc-900 dark:text-zinc-50">{value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-8 mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Etiqueta</h2>
      <LabelPreview orderId={order.id} initialCharged={order.impresiones_cobrables > 0} />
    </div>
  );
}
