import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getValidAccessToken, getShopsForConnection } from "@/lib/tiktok-shop/connection";
import { searchOrders, getOrderDetails, type TikTokOrder } from "@/lib/tiktok-shop/api-client";

// La búsqueda de pedidos de TikTok no admite filtrar por order_type (se
// comprobó contra la API real: lo ignora en silencio), así que hay que
// pedir páginas normales e ir descartando las que no sean "AUCTION" hasta
// reunir suficientes. Este tope evita un escaneo sin fin si hay muy pocas
// subastas entre muchísimos pedidos normales.
const MAX_PAGES_PER_SCAN = 15;
const PAGE_SIZE = 100;

export type AuctionOrderRow = {
  tiktokOrderId: string;
  status: string;
  createTime: number;
  priceCents: number;
  currency: string;
  cliente: string;
  productName: string;
  // Si ya existe en nuestra tabla "orders" (detectado antes por la extensión,
  // o sincronizado antes desde esta pantalla), se rellena para reutilizar el
  // mismo flujo de imprimir/notas que el Dashboard.
  local: {
    id: string;
    tk: string;
    notes: string | null;
    estado_impresion: string;
    impresiones_cobrables: number;
  } | null;
};

function clienteFromOrder(order: TikTokOrder): string {
  const addr = order.recipient_address;
  return addr?.name || [addr?.first_name, addr?.last_name].filter(Boolean).join(" ") || "—";
}

function priceCentsFromOrder(order: TikTokOrder): number {
  const amount = Number(order.payment?.total_amount ?? "0");
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

function toAuctionRow(order: TikTokOrder): AuctionOrderRow {
  return {
    tiktokOrderId: order.id,
    status: order.status,
    createTime: order.create_time,
    priceCents: priceCentsFromOrder(order),
    currency: order.payment?.currency ?? "EUR",
    cliente: clienteFromOrder(order),
    productName: order.line_items?.[0]?.product_name ?? "",
    local: null,
  };
}

/**
 * Trae pedidos de tipo "AUCTION" (subasta), más recientes primero,
 * paginando sobre la búsqueda normal de TikTok y filtrando aquí. Devuelve
 * como mucho una tanda (no todos los que haya) — para más, se sigue
 * pidiendo con el pageToken devuelto.
 */
export async function listAuctionOrders(
  tenantId: string,
  opts: { pageToken?: string; targetCount?: number } = {}
): Promise<{ orders: AuctionOrderRow[]; nextPageToken: string | null }> {
  const targetCount = opts.targetCount ?? 20;
  const connection = await getValidAccessToken(tenantId);
  const shops = await getShopsForConnection(connection.id);
  if (!shops.length) return { orders: [], nextPageToken: null };
  // Fase 1: una sola tienda por conexión en la práctica — se usa la primera.
  const shop = shops[0];

  const matched: TikTokOrder[] = [];
  let pageToken = opts.pageToken;
  let pagesScanned = 0;

  while (matched.length < targetCount && pagesScanned < MAX_PAGES_PER_SCAN) {
    const result = await searchOrders(connection.access_token, shop.shop_cipher, {
      pageSize: PAGE_SIZE,
      pageToken,
      sortField: "create_time",
      sortOrder: "DESC",
    });
    pagesScanned++;
    for (const order of result.orders) {
      if (order.order_type === "AUCTION") matched.push(order);
    }
    pageToken = result.next_page_token;
    if (!pageToken) break;
  }

  const rows = matched.slice(0, targetCount).map(toAuctionRow);
  await attachLocalOrders(tenantId, rows);

  return { orders: rows, nextPageToken: pageToken ?? null };
}

/** Rellena "local" para las filas que ya existan en nuestra tabla orders (por external_order_id). */
async function attachLocalOrders(tenantId: string, rows: AuctionOrderRow[]): Promise<void> {
  if (!rows.length) return;
  const ids = rows.map((r) => r.tiktokOrderId);
  const { data } = await supabaseAdmin
    .from("orders")
    .select("id, tk, external_order_id, notes, estado_impresion, impresiones_cobrables")
    .eq("tenant_id", tenantId)
    .in("external_order_id", ids);

  const byExternalId = new Map((data ?? []).map((o) => [o.external_order_id as string, o]));
  for (const row of rows) {
    const match = byExternalId.get(row.tiktokOrderId);
    if (match) {
      row.local = {
        id: match.id,
        tk: match.tk,
        notes: match.notes,
        estado_impresion: match.estado_impresion,
        impresiones_cobrables: match.impresiones_cobrables,
      };
    }
  }
}

/**
 * Da de alta en nuestra tabla "orders" un pedido de TikTok que la extensión
 * todavía no había detectado, para poder reutilizar exactamente el mismo
 * flujo de cobro/impresión que ya usan el Dashboard y la extensión
 * (claimAndChargePrint) — no se duplica esa lógica aquí.
 */
export async function ensureLocalOrder(
  tenantId: string,
  tiktokOrderId: string
): Promise<{ id: string; tk: string }> {
  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id, tk")
    .eq("tenant_id", tenantId)
    .eq("external_order_id", tiktokOrderId)
    .maybeSingle();
  if (existing) return existing as { id: string; tk: string };

  const connection = await getValidAccessToken(tenantId);
  const shops = await getShopsForConnection(connection.id);
  if (!shops.length) throw new Error("No hay ninguna tienda de TikTok Shop conectada.");

  const [order] = await getOrderDetails(connection.access_token, shops[0].shop_cipher, [tiktokOrderId]);
  if (!order) throw new Error("No se encontró ese pedido en TikTok Shop.");

  const { data: tk } = await supabaseAdmin.rpc("next_tk", { p_tenant_id: tenantId });

  const { data: created, error } = await supabaseAdmin
    .from("orders")
    .insert({
      tenant_id: tenantId,
      tk,
      external_order_id: order.id,
      cliente: clienteFromOrder(order),
      precio_cents: priceCentsFromOrder(order),
      moneda: order.payment?.currency ?? "EUR",
      fecha_pedido: new Date(order.create_time * 1000).toISOString(),
      raw_payload: { source: "tiktok_shop_api", order_type: order.order_type, status: order.status },
    })
    .select("id, tk")
    .single();
  if (error || !created) throw new Error(`No se pudo registrar el pedido: ${error?.message}`);

  return created as { id: string; tk: string };
}
