import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabase-paginate";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  // El consumo total (orders_processed) no depende de "users", así que se
  // lanza a la vez que la consulta de usuarios en vez de esperar a que esta
  // termine primero.
  const [{ data: users, error }, processedRows] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("id, email, name, last_name, tenant_id, is_admin, created_at")
      .order("created_at", { ascending: false }),
    // Consumo total desde el alta: suma de orders_processed.price_cents por
    // tenant (PostgREST limita a 1000 filas por página, se pagina completo).
    fetchAllRows<{ tenant_id: string; price_cents: number }>((from, to) =>
      supabaseAdmin.from("orders_processed").select("tenant_id, price_cents").range(from, to)
    ),
  ]);

  if (error) return NextResponse.json({ error: "No se pudo cargar la lista." }, { status: 500 });

  const userIds = (users ?? []).map((u) => u.id);
  const tenantIds = [...new Set((users ?? []).map((u) => u.tenant_id).filter(Boolean))];

  const [{ data: balances }, { data: tenants }] = await Promise.all([
    userIds.length > 0
      ? supabaseAdmin
          .from("user_balances")
          .select("user_id, current_tier, balance_cents, is_blocked, is_demo")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id: string; current_tier: number; balance_cents: number; is_blocked: boolean; is_demo: boolean }[] }),
    tenantIds.length > 0
      ? supabaseAdmin.from("tenants").select("id, status").in("id", tenantIds)
      : Promise.resolve({ data: [] as { id: string; status: string }[] }),
  ]);

  const consumedByTenant = new Map<string, number>();
  for (const row of processedRows) {
    consumedByTenant.set(row.tenant_id, (consumedByTenant.get(row.tenant_id) ?? 0) + row.price_cents);
  }

  const balanceByUser = new Map((balances ?? []).map((b) => [b.user_id, b]));
  const statusByTenant = new Map((tenants ?? []).map((t) => [t.id, t.status]));

  const enriched = (users ?? []).map((u) => ({
    ...u,
    balance: balanceByUser.get(u.id) ?? null,
    tenant_status: u.tenant_id ? (statusByTenant.get(u.tenant_id) ?? "active") : "active",
    total_consumed_cents: u.tenant_id ? (consumedByTenant.get(u.tenant_id) ?? 0) : 0,
  }));

  return NextResponse.json({ users: enriched });
}
