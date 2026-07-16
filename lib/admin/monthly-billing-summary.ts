import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabase-paginate";

export type MonthlyBillingSummary = {
  year: number;
  month: number;
  ordersCount: number;
  tenantsCount: number;
  totalCents: number;
  rechargedCents: number;
};

/** Primer y último día (ISO) del mes indicado, en base al huso horario del servidor. */
function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Facturación de un mes concreto, calculada al vuelo desde orders_processed
 * y balance_transactions (no depende de la tabla billing_periods, que no se
 * rellena en ningún sitio todavía — así el número siempre refleja los datos
 * reales). Compartida entre el panel (JSON) y la exportación CSV.
 */
export async function getMonthlyBillingSummary(year: number, month: number): Promise<MonthlyBillingSummary> {
  const { start, end } = monthRange(year, month);

  const [rows, rechargeRows] = await Promise.all([
    fetchAllRows<{ price_cents: number; tenant_id: string }>((from, to) =>
      supabaseAdmin
        .from("orders_processed")
        .select("price_cents, tenant_id")
        .gte("processed_at", start)
        .lt("processed_at", end)
        .range(from, to)
    ),
    // Dinero real cobrado por Stripe ese mes (recargas de saldo, netas de
    // reembolsos — "refund" se guarda en negativo) — no tiene por qué
    // coincidir con lo facturado por etiquetas del mismo mes: un cliente
    // puede recargar en julio y consumir esas etiquetas en agosto.
    fetchAllRows<{ amount_cents: number }>((from, to) =>
      supabaseAdmin
        .from("balance_transactions")
        .select("amount_cents")
        .in("type", ["recharge", "refund"])
        .gte("created_at", start)
        .lt("created_at", end)
        .range(from, to)
    ),
  ]);

  const totalCents = rows.reduce((sum, r) => sum + r.price_cents, 0);
  const tenantsCount = new Set(rows.map((r) => r.tenant_id)).size;
  const rechargedCents = rechargeRows.reduce((sum, r) => sum + r.amount_cents, 0);

  return { year, month, ordersCount: rows.length, tenantsCount, totalCents, rechargedCents };
}

/** Lista de {year, month} desde "desde" hasta "hasta" (ambos incluidos), en orden cronológico. */
export function monthsInRange(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number
): { year: number; month: number }[] {
  let start = new Date(Date.UTC(fromYear, fromMonth - 1, 1));
  let end = new Date(Date.UTC(toYear, toMonth - 1, 1));
  if (start > end) [start, end] = [end, start]; // por si "desde" es posterior a "hasta", se intercambian

  const months: { year: number; month: number }[] = [];
  let cursor = start;
  while (cursor <= end) {
    months.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return months;
}
