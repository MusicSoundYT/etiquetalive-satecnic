import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const ORDERS_PAGE_SIZE = 25;

export async function getOrdersPage(tenantId: string, page: number, pageSize = ORDERS_PAGE_SIZE) {
  const { count, error: countError } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (countError) throw new Error(`No se pudieron cargar los pedidos: ${countError.message}`);

  const total = count ?? 0;
  if (total === 0) return { orders: [], total: 0 };

  // Evita pedir a PostgREST un rango más allá de las filas existentes
  // (devuelve 416 "Requested range not satisfiable" si se hace).
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("fecha_detectado", { ascending: false })
    .range(from, to);

  if (error) throw new Error(`No se pudieron cargar los pedidos: ${error.message}`);

  return { orders: data ?? [], total };
}

export type OrdersStats = {
  total: number;
  impresos: number;
  pendientes: number;
  reimpresiones: number;
};

export async function getOrdersStats(tenantId: string): Promise<OrdersStats> {
  const { data, error } = await supabaseAdmin.rpc("get_orders_stats", { p_tenant_id: tenantId });
  if (error || !data || data.length === 0) {
    return { total: 0, impresos: 0, pendientes: 0, reimpresiones: 0 };
  }
  const row = data[0];
  return {
    total: row.total,
    impresos: row.impresos,
    pendientes: row.pendientes,
    reimpresiones: Number(row.reimpresiones),
  };
}
