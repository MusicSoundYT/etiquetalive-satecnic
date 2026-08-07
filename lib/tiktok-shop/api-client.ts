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

export type TikTokOrderSearchResult = {
  orders: Array<Record<string, unknown>>;
  next_page_token?: string;
  total_count?: number;
};

/**
 * Búsqueda de pedidos de una tienda. Sin filtros en el cuerpo, esto trae
 * los más recientes — suficiente para la prueba de "¿vemos los pedidos?"
 * de la Fase 1.
 */
export async function searchOrders(
  accessToken: string,
  shopCipher: string,
  opts: { pageSize?: number; pageToken?: string } = {}
): Promise<TikTokOrderSearchResult> {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    page_size: String(opts.pageSize ?? 20),
  };
  if (opts.pageToken) query.page_token = opts.pageToken;

  const bodyString = JSON.stringify({});
  return callApi<TikTokOrderSearchResult>({
    method: "POST",
    path: "/order/202309/orders/search",
    accessToken,
    query,
    bodyString,
  });
}
