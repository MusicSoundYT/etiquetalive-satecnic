import "server-only";
import { requireTikTokShopEnv } from "@/lib/env";
import { signTikTokRequest } from "@/lib/tiktok-shop/sign";

const API_BASE = "https://open-api.tiktokglobalshop.com";

/**
 * Llamada firmada genérica a la API de TikTok Shop. El cuerpo, si lo hay,
 * se firma exactamente como se envía (mismo string, sin volver a
 * serializarlo) — por eso se recibe ya como string, no como objeto.
 */
async function callApi<T>(params: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  accessToken: string;
  query?: Record<string, string>;
  bodyString?: string;
}): Promise<T> {
  const { appKey, appSecret } = requireTikTokShopEnv();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const query: Record<string, string> = { app_key: appKey, timestamp, ...(params.query ?? {}) };
  const sign = signTikTokRequest({ path: params.path, query, body: params.bodyString, appSecret });

  const url = new URL(API_BASE + params.path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.searchParams.set("sign", sign);

  const res = await fetch(url.toString(), {
    method: params.method,
    headers: {
      "x-tts-access-token": params.accessToken,
      ...(params.bodyString ? { "content-type": "application/json" } : {}),
    },
    body: params.bodyString,
  });
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`TikTok Shop API (${params.path}) falló: ${json.message ?? "sin mensaje"} (code ${json.code})`);
  }
  return json.data as T;
}

export type TikTokAuthorizedShop = {
  id: string;
  name: string;
  region: string;
  seller_type: string;
  cipher: string;
  code: string;
};

/**
 * Tiendas a las que da acceso un access_token. La respuesta de intercambio
 * de tokens NO incluye ningún identificador de tienda — hay que pedirlo
 * aparte con esta llamada, justo después de autorizar.
 */
export async function getAuthorizedShops(accessToken: string): Promise<TikTokAuthorizedShop[]> {
  const data = await callApi<{ shops: TikTokAuthorizedShop[] }>({
    method: "GET",
    path: "/authorization/202309/shops",
    accessToken,
  });
  return data.shops;
}

export type TikTokOrder = {
  id: string;
  order_type: string;
  status: string;
  create_time: number;
  update_time: number;
  payment?: { total_amount?: string; currency?: string };
  recipient_address?: { name?: string; first_name?: string; last_name?: string };
  line_items?: Array<{ product_id?: string; product_name?: string; sale_price?: string; currency?: string }>;
};

export type TikTokOrderSearchResult = {
  orders: TikTokOrder[];
  next_page_token?: string;
  total_count?: number;
};

/**
 * Búsqueda de pedidos de una tienda. La API no permite filtrar por
 * order_type en el propio buscador (se probó: lo ignora en silencio), así
 * que quien filtre por "AUCTION" tiene que hacerlo después, sobre lo que
 * devuelve esta función.
 */
export async function searchOrders(
  accessToken: string,
  shopCipher: string,
  opts: { pageSize?: number; pageToken?: string; sortField?: "create_time" | "update_time"; sortOrder?: "ASC" | "DESC" } = {}
): Promise<TikTokOrderSearchResult> {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    page_size: String(opts.pageSize ?? 20),
  };
  if (opts.pageToken) query.page_token = opts.pageToken;
  if (opts.sortField) query.sort_field = opts.sortField;
  if (opts.sortOrder) query.sort_order = opts.sortOrder;

  const bodyString = JSON.stringify({});
  return callApi<TikTokOrderSearchResult>({
    method: "POST",
    path: "/order/202309/orders/search",
    accessToken,
    query,
    bodyString,
  });
}

/**
 * Suscribe (o actualiza, es idempotente) el aviso de cambio de estado de
 * pedido para esta tienda. address debe ser HTTPS y responder rápido.
 */
export async function registerOrderStatusWebhook(accessToken: string, address: string): Promise<void> {
  await callApi<unknown>({
    method: "PUT",
    path: "/event/202309/webhooks",
    accessToken,
    bodyString: JSON.stringify({ address, event_type: "ORDER_STATUS_CHANGE" }),
  });
}

export type TikTokWebhookSubscription = { address: string; event_type: string };

/** Webhooks activos actualmente registrados para esta tienda. */
export async function listRegisteredWebhooks(accessToken: string): Promise<TikTokWebhookSubscription[]> {
  const data = await callApi<{ webhooks: TikTokWebhookSubscription[] }>({
    method: "GET",
    path: "/event/202309/webhooks",
    accessToken,
  });
  return data.webhooks ?? [];
}

/** Detalle completo de uno o varios pedidos (hasta 50 ids por llamada). */
export async function getOrderDetails(accessToken: string, shopCipher: string, orderIds: string[]): Promise<TikTokOrder[]> {
  const data = await callApi<{ orders: TikTokOrder[] }>({
    method: "GET",
    path: "/order/202507/orders",
    accessToken,
    query: { shop_cipher: shopCipher, ids: orderIds.join(",") },
  });
  return data.orders;
}
