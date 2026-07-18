import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveSortColumn, type OrdersFilter } from "@/lib/orders/list";
import { maskBuyerName } from "@/lib/orders/mask-buyer-name";

export const ADMIN_ORDERS_PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;

// Solo se seleccionan las columnas necesarias — en particular, nunca se pide
// precio_cents/moneda a la base de datos para el listado de admin (privacidad
// de los compradores de tus clientes: el precio de un pedido concreto no
// aporta nada a la administración de la plataforma y no debe ni transitar
// por el servidor). El filtro `q` sí puede buscar por `cliente` en la
// consulta SQL (dato real, del lado del servidor) aunque el nombre que
// vuelve al navegador ya esté enmascarado.
const ADMIN_ORDER_COLUMNS = "id, tk, external_order_id, cliente, fecha_detectado, estado_impresion, reimpresiones, impresiones_cobrables, tenant_id, tenants(business_name)";

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
  fecha_detectado: string;
  estado_impresion: string;
  reimpresiones: number;
  impresiones_cobrables: number;
  tenant_id: string;
  tenants: { business_name: string } | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function maskRow(row: any): AdminOrderRow {
  return { ...row, cliente: maskBuyerName(row.cliente) };
}

export async function getAdminOrdersPage(
  page: number,
  filter: AdminOrdersFilter = {},
  pageSize = ADMIN_ORDERS_PAGE_SIZE
): Promise<{ orders: AdminOrderRow[]; total: number }> {
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
    supabaseAdmin.from("orders").select(ADMIN_ORDER_COLUMNS),
    filter
  )
    .order(resolveSortColumn(filter.sort), { ascending: filter.dir === "asc" })
    .range(from, to);

  const { data, error } = await dataQuery;
  if (error) throw new Error(`No se pudieron cargar los pedidos: ${error.message}`);

  return { orders: (data ?? []).map(maskRow), total };
}

export async function getAdminOrdersForExport(filter: AdminOrdersFilter = {}): Promise<AdminOrderRow[]> {
  const query = applyAdminOrdersFilter(
    supabaseAdmin.from("orders").select(ADMIN_ORDER_COLUMNS),
    filter
  )
    .order(resolveSortColumn(filter.sort), { ascending: filter.dir === "asc" })
    .limit(EXPORT_LIMIT);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron exportar los pedidos: ${error.message}`);
  return (data ?? []).map(maskRow);
}
