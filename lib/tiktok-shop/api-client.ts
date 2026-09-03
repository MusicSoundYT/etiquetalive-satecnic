import "server-only";
import { signTikTokRequest } from "@/lib/tiktok-shop/sign";

const API_BASE = "https://open-api.tiktokglobalshop.com";

// Cada tenant tiene su propia app registrada en el Partner Center de TikTok
// (ver lib/tiktok-shop/app-credentials.ts) — ya no hay una app_key/app_secret
// global, así que toda llamada a la API necesita saber de qué tenant es.
export type TikTokApiCredentials = {
  accessToken: string;
  appKey: string;
  appSecret: string;
};

/**
 * Llamada firmada genérica a la API de TikTok Shop. El cuerpo, si lo hay,
 * se firma exactamente como se envía (mismo string, sin volver a
 * serializarlo) — por eso se recibe ya como string, no como objeto.
 */
async function callApi<T>(params: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  credentials: TikTokApiCredentials;
  query?: Record<string, string>;
  bodyString?: string;
}): Promise<T> {
  const { accessToken, appKey, appSecret } = params.credentials;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const query: Record<string, string> = { app_key: appKey, timestamp, ...(params.query ?? {}) };
  const sign = signTikTokRequest({ path: params.path, query, body: params.bodyString, appSecret });

  const url = new URL(API_BASE + params.path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.searchParams.set("sign", sign);

  const res = await fetch(url.toString(), {
    method: params.method,
    headers: {
      "x-tts-access-token": accessToken,
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
export async function getAuthorizedShops(credentials: TikTokApiCredentials): Promise<TikTokAuthorizedShop[]> {
  const data = await callApi<{ shops: TikTokAuthorizedShop[] }>({
    method: "GET",
    path: "/authorization/202309/shops",
    credentials,
  });
  return data.shops;
}

export type TikTokOrder = {
  id: string;
  order_type: string;
  status: string;
  create_time: number;
  update_time: number;
  payment?: { total_amount?: string; sub_total?: string; currency?: string };
  recipient_address?: { name?: string; first_name?: string; last_name?: string };
  line_items?: Array<{ product_id?: string; product_name?: string; sale_price?: string; currency?: string }>;
  // Identificador interno de TikTok para el comprador — a diferencia de
  // recipient_address.name (que a veces viene enmascarado, comprobado en
  // producción), este nunca lo está y se mantiene igual en todos los
  // pedidos de la misma persona en esta tienda. Se usa en Caja TikTok para
  // reconocer a un cliente ya conocido aunque el nombre venga tapado.
  user_id?: string;
  // Cuando el pedido usa la logística de TikTok (shipping_type "TIKTOK", lo
  // habitual en Woow Insólito/Magic Days), TikTok ya crea el paquete él
  // solo en cuanto el pedido está listo para enviar — comprobado en
  // producción. Si esto ya trae algo, NO hay que crear un paquete nuevo
  // (ver generate-shipping-label/route.ts).
  packages?: Array<{ id: string }>;
  shipping_type?: string;
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
  credentials: TikTokApiCredentials,
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
    credentials,
    query,
    bodyString,
  });
}

/**
 * Suscribe (o actualiza, es idempotente) el aviso de cambio de estado de
 * pedido para esta tienda. address debe ser HTTPS y responder rápido.
 * shop_cipher es obligatorio: sin él la API no sabe a qué tienda te refieres
 * (confirmado en producción: error 106013 "Missing identifier" sin este dato).
 */
export async function registerOrderStatusWebhook(credentials: TikTokApiCredentials, shopCipher: string, address: string): Promise<void> {
  await callApi<unknown>({
    method: "PUT",
    path: "/event/202309/webhooks",
    credentials,
    query: { shop_cipher: shopCipher },
    bodyString: JSON.stringify({ address, event_type: "ORDER_STATUS_CHANGE" }),
  });
}

export type TikTokWebhookSubscription = { address: string; event_type: string };

/** Webhooks activos actualmente registrados para esta tienda. */
export async function listRegisteredWebhooks(credentials: TikTokApiCredentials, shopCipher: string): Promise<TikTokWebhookSubscription[]> {
  const data = await callApi<{ webhooks: TikTokWebhookSubscription[] }>({
    method: "GET",
    path: "/event/202309/webhooks",
    credentials,
    query: { shop_cipher: shopCipher },
  });
  return data.webhooks ?? [];
}

/** Detalle completo de uno o varios pedidos (hasta 50 ids por llamada). */
export async function getOrderDetails(credentials: TikTokApiCredentials, shopCipher: string, orderIds: string[]): Promise<TikTokOrder[]> {
  const data = await callApi<{ orders: TikTokOrder[] }>({
    method: "GET",
    path: "/order/202507/orders",
    credentials,
    query: { shop_cipher: shopCipher, ids: orderIds.join(",") },
  });
  return data.orders;
}

/**
 * Crea el paquete de envío de UN pedido. Confirmado en producción: el campo
 * es "order_id" (no "order_ids"), espera un string (no un array: "type
 * incorrect, expected type:string"), y ese string debe ser un único número
 * de pedido convertible a Int64 — ni un array ni varios IDs separados por
 * comas funcionan ("OrderId is invalid, the value must be convertible to
 * Int64"). TikTok sí permite combinar varios pedidos del mismo cliente en
 * una sola etiqueta desde Seller Center, pero el campo real para hacerlo
 * por API no se ha podido confirmar sin documentación completa — de
 * momento se genera un paquete/etiqueta por pedido.
 *
 * OJO: cuando el pedido usa la logística de TikTok (lo habitual aquí),
 * TikTok ya crea el paquete él solo en cuanto el pedido está listo para
 * enviar — llamar a esto para un pedido que ya tiene su propio
 * order.packages[] falla ("Internal error" genérico, comprobado en
 * producción). Quien llame a esto debe comprobar antes si el pedido ya
 * trae un package_id (getOrderDetails) y, si es así, reutilizarlo en vez
 * de llamar aquí — ver generate-shipping-label/route.ts.
 */
export type TikTokPackage = { package_id: string };

export async function createShippingPackage(
  credentials: TikTokApiCredentials,
  shopCipher: string,
  orderId: string
): Promise<TikTokPackage> {
  return callApi<TikTokPackage>({
    method: "POST",
    path: "/fulfillment/202309/packages",
    credentials,
    query: { shop_cipher: shopCipher },
    bodyString: JSON.stringify({ order_id: orderId }),
  });
}

/**
 * Confirma/arranca el envío de un paquete ya creado — paso intermedio
 * imprescindible que faltaba (confirmado con la documentación oficial y
 * probado en producción con un pedido real): sin este paso, el documento
 * de envío da siempre "Documents couldn't be printed before shipped" por
 * mucho que el paquete ya exista. handover_method/pickup_slot y
 * self_shipment son opcionales — solo hace falta self_shipment cuando el
 * propio vendedor elige transportista (no es el caso: aquí TikTok ya
 * asigna el suyo). Un cuerpo vacío es válido y funciona.
 */
export async function shipPackage(credentials: TikTokApiCredentials, shopCipher: string, packageId: string): Promise<void> {
  await callApi<unknown>({
    method: "POST",
    path: `/fulfillment/202309/packages/${packageId}/ship`,
    credentials,
    query: { shop_cipher: shopCipher },
    bodyString: JSON.stringify({}),
  });
}

export type TikTokShippingDocument = { doc_url: string; tracking_number?: string };

/**
 * Documento de envío (PDF) de un paquete ya creado y enviado
 * (shipPackage). Justo después de enviarlo puede tardar unos segundos en
 * estar listo (confirmado en producción: falla las primeras veces con
 * "Documents couldn't be printed before shipped" incluso habiendo llamado
 * ya a shipPackage con éxito) — quien llame a esto debe reintentar con una
 * pequeña espera, no darlo por error a la primera.
 *
 * document_type=SHIPPING_LABEL_AND_PACKING_SLIP (no solo SHIPPING_LABEL):
 * confirmado en producción que TikTok trata cada tipo como un documento
 * casi independiente — pedir solo la etiqueta daba un PDF de una sola
 * página (sin el albarán con el listado de productos que sí llevan las
 * etiquetas reales de Seller Center), y en pedidos ya recogidos por el
 * transportista, "SHIPPING_LABEL" a secas incluso llega a fallar
 * (code 21042102, "no se puede imprimir tras la recogida") mientras que el
 * albarán solo seguía disponible sin problema. Los valores válidos, según
 * el propio error de TikTok si se manda uno inválido: SHIPPING_LABEL,
 * PACKING_SLIP, SHIPPING_LABEL_AND_PACKING_SLIP, SHIPPING_LABEL_PICTURE,
 * HAZMAT_LABEL, INVOICE_LABEL.
 */
export async function getPackageShippingDocument(
  credentials: TikTokApiCredentials,
  shopCipher: string,
  packageId: string
): Promise<TikTokShippingDocument> {
  return callApi<TikTokShippingDocument>({
    method: "GET",
    path: `/fulfillment/202309/packages/${packageId}/shipping_documents`,
    credentials,
    query: { shop_cipher: shopCipher, document_type: "SHIPPING_LABEL_AND_PACKING_SLIP" },
  });
}
