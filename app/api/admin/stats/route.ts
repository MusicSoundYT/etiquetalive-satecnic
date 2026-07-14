import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const [{ count: totalTenants }, { count: totalUsers }, { count: totalOrders }] = await Promise.all([
    supabaseAdmin.from("tenants").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("orders").select("*", { count: "exact", head: true }),
  ]);

  const { data: orderRows } = await supabaseAdmin
    .from("orders")
    .select("impresiones_cobrables, reimpresiones");
  const totalImpresiones = (orderRows ?? []).reduce(
    (sum, o) => sum + (o.impresiones_cobrables > 0 ? 1 : 0) + o.reimpresiones,
    0
  );

  const { data: processedRows } = await supabaseAdmin.from("orders_processed").select("price_cents");
  const totalFacturableCents = (processedRows ?? []).reduce((sum, p) => sum + p.price_cents, 0);

  return NextResponse.json({
    totalTenants: totalTenants ?? 0,
    totalUsers: totalUsers ?? 0,
    totalOrders: totalOrders ?? 0,
    totalImpresiones,
    totalFacturableCents,
  });
}
