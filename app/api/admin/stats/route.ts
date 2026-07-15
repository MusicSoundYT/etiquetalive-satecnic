import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabase-paginate";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  // Las 5 consultas son independientes entre sí: se lanzan todas a la vez en
  // vez de esperar una detrás de otra (antes tardaba la suma de las 5).
  const [
    { count: totalTenants },
    { count: totalUsers },
    { count: totalOrders },
    orderRows,
    processedRows,
  ] = await Promise.all([
    supabaseAdmin.from("tenants").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("orders").select("*", { count: "exact", head: true }),
    // PostgREST tope a 1000 filas por respuesta: hay que paginar para sumar
    // sobre tablas que pueden superarlo (orders_processed ya tiene miles).
    fetchAllRows<{ impresiones_cobrables: number; reimpresiones: number }>((from, to) =>
      supabaseAdmin.from("orders").select("impresiones_cobrables, reimpresiones").range(from, to)
    ),
    fetchAllRows<{ price_cents: number }>((from, to) =>
      supabaseAdmin.from("orders_processed").select("price_cents").range(from, to)
    ),
  ]);

  const totalImpresiones = orderRows.reduce(
    (sum, o) => sum + (o.impresiones_cobrables > 0 ? 1 : 0) + o.reimpresiones,
    0
  );
  const totalFacturableCents = processedRows.reduce((sum, p) => sum + p.price_cents, 0);

  return NextResponse.json({
    totalTenants: totalTenants ?? 0,
    totalUsers: totalUsers ?? 0,
    totalOrders: totalOrders ?? 0,
    totalImpresiones,
    totalFacturableCents,
  });
}
