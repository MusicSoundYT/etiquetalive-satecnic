import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { getOrderDetails, type TikTokOrder } from "@/lib/tiktok-shop/api-client";

export type AuctionOrderRow = {
  tiktokOrderId: string;
  shopId: string | null;
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

/**
 * Trae pedidos de tipo "AUCTION" (subasta), más recientes primero.
 *
 * OJO: esto NO llama a la búsqueda de pedidos de TikTok (searchOrders) — se
 * comprobó contra la API real que su índice va varios días por detrás (un
 * pedido de hoy tardaba +2 días en aparecer ahí), así que devolvía siempre
 * una lista desactualizada aunque se preguntara constantemente. En cambio,
 * el pedido por ID concreto (getOrderDetails, el mismo que usa el webhook de
 * ORDER_STATUS_CHANGE) sí es instantáneo — por eso cada pedido de subasta ya
 * queda guardado en nuestra propia tabla "orders" en el momento en que llega
 * su primer webhook (ensureLocalOrder). Así que la forma fiable de listar
 * "los pedidos de subasta recientes" es leer directamente de ahí, no volver
 * a preguntarle a TikTok.
 */
export async function listAuctionOrders(
  tenantId: string,
  // shopId filtra a una sola tienda de TikTok cuando el tenant tiene varias
  // conectadas (varias trabajadoras, cada una con la suya) — sin esto, se
  // mezclarían pedidos de todas las tiendas en la misma lista.
  opts: { pageToken?: string; targetCount?: number; shopId?: string } = {}
): Promise<{ orders: AuctionOrderRow[]; nextPageToken: string | null }> {
  const targetCount = opts.targetCount ?? 20;
  const offset = opts.pageToken ? Number(opts.pageToken) || 0 : 0;

  let query = supabaseAdmin
    .from("orders")
    .select(
      "id, tk, external_order_id, tiktok_shop_id, cliente, precio_cents, moneda, fecha_pedido, fecha_detectado, notes, estado_impresion, impresiones_cobrables, raw_payload"
    )
    .eq("tenant_id", tenantId)
    .eq("raw_payload->>source", "tiktok_shop_api");
  if (opts.shopId) query = query.eq("tiktok_shop_id", opts.shopId);

  const { data, error } = await query
    .order("fecha_pedido", { ascending: false, nullsFirst: false })
    .range(offset, offset + targetCount - 1);

  if (error) throw new Error(`No se pudieron listar los pedidos de subasta: ${error.message}`);

  const rows: AuctionOrderRow[] = (data ?? []).map((o) => {
    const payload = (o.raw_payload ?? {}) as { status?: string };
    return {
      tiktokOrderId: o.external_order_id as string,
      shopId: o.tiktok_shop_id as string | null,
      status: payload.status ?? "UNPAID",
      createTime: Math.floor(new Date((o.fecha_pedido as string) ?? (o.fecha_detectado as string)).getTime() / 1000),
      priceCents: o.precio_cents as number,
      currency: (o.moneda as string) ?? "EUR",
      cliente: o.cliente as string,
      productName: "",
      local: {
        id: o.id as string,
        tk: o.tk as string,
        notes: o.notes as string | null,
        estado_impresion: o.estado_impresion as string,
        impresiones_cobrables: o.impresiones_cobrables as number,
      },
    };
  });

  const nextPageToken = rows.length === targetCount ? String(offset + rows.length) : null;
  return { orders: rows, nextPageToken };
}

/**
 * Da de alta en nuestra tabla "orders" un pedido de TikTok que la extensión
 * todavía no había detectado, para poder reutilizar exactamente el mismo
 * flujo de cobro/impresión que ya usan el Dashboard y la extensión
 * (claimAndChargePrint) — no se duplica esa lógica aquí.
 */
export async function ensureLocalOrder(
  tenantId: string,
  tiktokOrderId: string,
  opts: {
    // De qué tienda de TikTok viene — un tenant puede tener varias
    // conectadas (varias trabajadoras, cada una con la suya), así que hay
    // que guardarlo por pedido para poder filtrar luego por tienda.
    shopId?: string;
    // Si quien llama ya ha pedido este pedido a TikTok hace un momento (el
    // webhook lo hace para comprobar order_type antes de llegar aquí), se
    // reutiliza en vez de volver a pedirlo — evita duplicar la llamada a la
    // API de TikTok en cada aviso de webhook.
    prefetchedOrder?: TikTokOrder;
  } = {}
): Promise<{ id: string; tk: string }> {
  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id, tk")
    .eq("tenant_id", tenantId)
    .eq("external_order_id", tiktokOrderId)
    .maybeSingle();

  let order = opts.prefetchedOrder;
  let shopId = opts.shopId;
  if (!order) {
    const connection = await getValidAccessToken(tenantId);
    const shops = await getShopsForConnection(connection.id);
    if (!shops.length) throw new Error("No hay ninguna tienda de TikTok Shop conectada.");
    const shop = shops[0];
    shopId = shopId ?? shop.shop_id;
    [order] = await getOrderDetails(toApiCredentials(connection), shop.shop_cipher, [tiktokOrderId]);
  }
  if (!order) throw new Error("No se encontró ese pedido en TikTok Shop.");

  if (existing) {
    // El pedido ya estaba dado de alta (de un webhook anterior) — se
    // refresca igualmente su estado de TikTok (raw_payload.status), que si
    // no se quedaría congelado en lo que fuera la primera vez que se vio
    // este pedido, sin reflejar los cambios de estado (pagado, enviado,
    // completado...) que van llegando en webhooks posteriores.
    await supabaseAdmin
      .from("orders")
      .update({ raw_payload: { source: "tiktok_shop_api", order_type: order.order_type, status: order.status } })
      .eq("id", existing.id);
    return existing as { id: string; tk: string };
  }

  const { data: tk } = await supabaseAdmin.rpc("next_tk", { p_tenant_id: tenantId });

  const { data: created, error } = await supabaseAdmin
    .from("orders")
    .insert({
      tenant_id: tenantId,
      tk,
      external_order_id: order.id,
      tiktok_shop_id: shopId ?? null,
      cliente: clienteFromOrder(order),
      precio_cents: priceCentsFromOrder(order),
      moneda: order.payment?.currency ?? "EUR",
      fecha_pedido: new Date(order.create_time * 1000).toISOString(),
      raw_payload: { source: "tiktok_shop_api", order_type: order.order_type, status: order.status },
    })
    .select("id, tk")
    .single();

  if (error?.code === "23505") {
    // Carrera con la extensión o con otro webhook casi simultáneo — la
    // restricción única de (tenant_id, external_order_id) lo bloquea aquí.
    // Se recupera la fila que sí se creó en vez de fallar.
    const { data: winner } = await supabaseAdmin
      .from("orders")
      .select("id, tk")
      .eq("tenant_id", tenantId)
      .eq("external_order_id", tiktokOrderId)
      .maybeSingle();
    if (!winner) throw new Error("No se pudo registrar el pedido tras una carrera de creación.");
    return winner as { id: string; tk: string };
  }
  if (error || !created) throw new Error(`No se pudo registrar el pedido: ${error?.message}`);

  return created as { id: string; tk: string };
}
