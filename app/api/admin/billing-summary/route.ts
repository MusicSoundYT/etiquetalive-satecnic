import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabase-paginate";

/** Primer y último día (ISO) del mes indicado, en base al huso horario del servidor. */
function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Facturación de un mes concreto, calculada al vuelo desde orders_processed
 * (no depende de la tabla billing_periods, que no se rellena en ningún sitio
 * todavía — así el número siempre refleja los datos reales).
 */
export async function GET(req: NextRequest) {
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const now = new Date();
  // Por defecto, el mes actual (el panel llama a este endpoint siempre con
  // year/month explícitos, pero se mantiene un valor por defecto sensato
  // por si se llama sin parámetros).
  const year = Number(req.nextUrl.searchParams.get("year")) || now.getUTCFullYear();
  const month = Number(req.nextUrl.searchParams.get("month")) || now.getUTCMonth() + 1;

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

  return NextResponse.json({
    year,
    month,
    ordersCount: rows.length,
    tenantsCount,
    totalCents,
    rechargedCents,
  });
}
