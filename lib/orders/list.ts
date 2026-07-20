import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const ORDERS_PAGE_SIZE = 300;
const EXPORT_LIMIT = 5000;

export type OrdersFilter = {
  from?: string;
  to?: string;
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
};

const SORTABLE_COLUMNS: Record<string, string> = {
  fecha: "fecha_detectado",
  precio: "precio_cents",
  estado: "estado_impresion",
  tk: "tk",
  cliente: "cliente",
};

export function resolveSortColumn(sort?: string): string {
  return SORTABLE_COLUMNS[sort ?? ""] ?? "fecha_detectado";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOrdersFilter(query: any, tenantId: string, filter: OrdersFilter) {
  query = query.eq("tenant_id", tenantId);
  if (filter.from) query = query.gte("fecha_detectado", filter.from);
  if (filter.to) query = query.lte("fecha_detectado", filter.to);
  if (filter.q) {
    // Los operadores de PostgREST usan "," y "()" como separadores de su propia
    // sintaxis: se eliminan del término de búsqueda para no romper el filtro.
    const safe = filter.q.replace(/[,()]/g, "").trim();
    if (safe) {
      query = query.or(
        `tk.ilike.%${safe}%,cliente.ilike.%${safe}%,external_order_id.ilike.%${safe}%`
      );
    }
  }
  return query;
}

export async function getOrdersPage(
  tenantId: string,
  page: number,
  filter: OrdersFilter = {},
  pageSize = ORDERS_PAGE_SIZE
) {
  const countQuery = applyOrdersFilter(
    supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
    tenantId,
    filter
  );
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(`No se pudieron cargar los pedidos: ${countError.message}`);

  const total = count ?? 0;
  if (total === 0) return { orders: [], total: 0 };

  // Evita pedir a PostgREST un rango más allá de las filas existentes
  // (devuelve 416 "Requested range not satisfiable" si se hace).
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const dataQuery = applyOrdersFilter(supabaseAdmin.from("orders").select("*"), tenantId, filter)
    .order(resolveSortColumn(filter.sort), { ascending: filter.dir === "asc" })
    .range(from, to);

  const { data, error } = await dataQuery;
  if (error) throw new Error(`No se pudieron cargar los pedidos: ${error.message}`);

  return { orders: data ?? [], total };
}

/** Igual que getOrdersPage pero sin paginar (para exportar a CSV), con un tope de filas. */
export async function getOrdersForExport(tenantId: string, filter: OrdersFilter = {}) {
  const query = applyOrdersFilter(supabaseAdmin.from("orders").select("*"), tenantId, filter)
    .order(resolveSortColumn(filter.sort), { ascending: filter.dir === "asc" })
    .limit(EXPORT_LIMIT);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron exportar los pedidos: ${error.message}`);
  return data ?? [];
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
