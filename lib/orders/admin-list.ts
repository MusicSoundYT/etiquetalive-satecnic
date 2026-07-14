import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveSortColumn, type OrdersFilter } from "@/lib/orders/list";

export const ADMIN_ORDERS_PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;

export type AdminOrdersFilter = OrdersFilter & { tenantId?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAdminOrdersFilter(query: any, filter: AdminOrdersFilter) {
  if (filter.tenantId) query = query.eq("tenant_id", filter.tenantId);
  if (filter.from) query = query.gte("fecha_detectado", filter.from);
  if (filter.to) query = query.lte("fecha_detectado", filter.to);
  if (filter.q) {
    const safe = filter.q.replace(/[,()]/g, "").trim();
    if (safe) {
      query = query.or(
        `tk.ilike.%${safe}%,cliente.ilike.%${safe}%,external_order_id.ilike.%${safe}%`
      );
    }
  }
  return query;
}

export type AdminOrderRow = {
  id: string;
  tk: string;
  external_order_id: string | null;
  cliente: string | null;
  precio_cents: number;
  moneda: string;
  fecha_detectado: string;
  estado_impresion: string;
  reimpresiones: number;
  impresiones_cobrables: number;
  tenant_id: string;
  tenants: { business_name: string } | null;
};

export async function getAdminOrdersPage(
  page: number,
  filter: AdminOrdersFilter = {},
  pageSize = ADMIN_ORDERS_PAGE_SIZE
) {
  const countQuery = applyAdminOrdersFilter(
    supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
    filter
  );
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(`No se pudieron cargar los pedidos: ${countError.message}`);

  const total = count ?? 0;
  if (total === 0) return { orders: [] as AdminOrderRow[], total: 0 };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const dataQuery = applyAdminOrdersFilter(
    supabaseAdmin.from("orders").select("*, tenants(business_name)"),
    filter
  )
    .order(resolveSortColumn(filter.sort), { ascending: filter.dir === "asc" })
    .range(from, to);

  const { data, error } = await dataQuery;
  if (error) throw new Error(`No se pudieron cargar los pedidos: ${error.message}`);

  return { orders: (data ?? []) as unknown as AdminOrderRow[], total };
}

export async function getAdminOrdersForExport(filter: AdminOrdersFilter = {}) {
  const query = applyAdminOrdersFilter(
    supabaseAdmin.from("orders").select("*, tenants(business_name)"),
    filter
  )
    .order(resolveSortColumn(filter.sort), { ascending: filter.dir === "asc" })
    .limit(EXPORT_LIMIT);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron exportar los pedidos: ${error.message}`);
  return (data ?? []) as unknown as AdminOrderRow[];
}
