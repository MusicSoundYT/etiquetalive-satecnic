import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyWebhookSignature, type TikTokOrderStatusChangePayload } from "@/lib/tiktok-shop/webhook";
import { getOrderDetails } from "@/lib/tiktok-shop/api-client";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { getAppCredentialsForTenant } from "@/lib/tiktok-shop/app-credentials";
import { ensureLocalOrder, clienteFromOrder, CLIENTE_DESCONOCIDO, subtotalCentsFromOrder } from "@/lib/tiktok-shop/auction-orders";
import { claimAndChargePrint } from "@/lib/orders/charge-print";

/** A qué tenant pertenece una tienda de TikTok, o null si no la conocemos. */
async function resolveTenantIdForShop(shopId: string): Promise<string | null> {
  const { data: shopRow } = await supabaseAdmin
    .from("tiktok_shop_shops")
    .select("connection_id")
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!shopRow) return null;

  const { data: connectionRow } = await supabaseAdmin
    .from("tiktok_shop_connections")
    .select("tenant_id")
    .eq("id", shopRow.connection_id)
    .maybeSingle();
  return (connectionRow?.tenant_id as string) ?? null;
}

/**
 * TikTok llama aquí al instante cuando cambia el estado de un pedido
 * (ORDER_STATUS_CHANGE). Si es un pedido de subasta, lo cobra y lo deja
 * listo para imprimir — la impresión física la dispara después el
 * navegador que tenga abierta la pantalla de Pedidos (API), consultando
 * /api/tiktok/pending-print.
 *
 * La firma va sobre el cuerpo EN CRUDO tal cual llega — por eso se lee con
 * req.text() y nunca con req.json() (reformatear el cuerpo invalidaría la
 * firma antes incluso de poder comprobarla).
 *
 * Cada tenant tiene su propia app de TikTok (su propio app_secret), así que
 * hay que saber de qué tienda es el aviso ANTES de poder verificar su firma
 * — se lee shop_id del cuerpo sin fiarse todavía de nada más, se busca qué
 * tenant es esa tienda, y se verifica la firma con SU app_secret. Solo si
 * la firma es válida se actúa sobre el resto del contenido. Mismo patrón
 * que usan los webhooks multi-cuenta de GitHub Apps o Stripe Connect.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  let payload: TikTokOrderStatusChangePayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const tenantId = await resolveTenantIdForShop(payload.shop_id);
  if (!tenantId) {
    console.error("[TikTok Shop] Webhook de una tienda sin conexión guardada:", payload.shop_id);
    return NextResponse.json({ error: "Tienda desconocida." }, { status: 401 });
  }

  let appKey: string, appSecret: string;
  try {
    ({ appKey, appSecret } = await getAppCredentialsForTenant(tenantId));
  } catch {
    return NextResponse.json({ error: "Sin credenciales de app para este tenant." }, { status: 401 });
  }

  const signature = req.headers.get("authorization");
  if (!verifyWebhookSignature(rawBody, appKey, appSecret, signature)) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }

  // Idempotencia: TikTok puede reenviar el mismo aviso. Si ya lo teníamos,
  // se responde ok sin reprocesar (evita cobrar dos veces por un reintento).
  const { error: insertError } = await supabaseAdmin.from("tiktok_webhook_events").insert({
    notification_id: payload.tts_notification_id,
    event_type: "ORDER_STATUS_CHANGE",
    shop_id: payload.shop_id,
    payload,
  });
  if (insertError) {
    // code 23505 = ya existía (duplicado real) -> ok, no es un fallo.
    if (insertError.code === "23505") return NextResponse.json({ status: "duplicate" });
    console.error("[TikTok Shop] Error guardando el evento de webhook:", insertError);
    return NextResponse.json({ error: "No se pudo registrar el evento." }, { status: 500 });
  }

  try {
    await processOrderStatusChange(tenantId, payload);
    await supabaseAdmin
      .from("tiktok_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("notification_id", payload.tts_notification_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    console.error("[TikTok Shop] Error procesando webhook:", err);
    await supabaseAdmin
      .from("tiktok_webhook_events")
      .update({ processing_error: message })
      .eq("notification_id", payload.tts_notification_id);
    // Se devuelve 200 igualmente: el evento ya ha quedado registrado (con el
    // error) y no queremos que TikTok lo reintente en bucle por un fallo
    // nuestro puntual — se puede reprocesar a mano si hace falta.
  }

  return NextResponse.json({ status: "ok" });
}

/**
 * Segunda (y última) comprobación del nombre del cliente, en el primer
 * aviso posterior al de creación del pedido. Cubre dos casos distintos
 * vistos en producción:
 *  - El pedido se quedó con CLIENTE_DESCONOCIDO (dirección aún vacía) — se
 *    cobra/imprime aquí mismo en cuanto haya nombre, es la primera vez que
 *    de verdad tiene todos los datos.
 *  - El pedido YA tenía un nombre no vacío, pero TikTok lo sustituyó por
 *    otro poco después (p. ej. un nombre provisional "usuario NombreRaro"
 *    que luego cambia al nombre real de envío) — sin esto, el mismo cliente
 *    real podía acabar con dos textos de "cliente" distintos entre pedidos,
 *    partiéndose en fichas distintas en Caja TikTok.
 * Se marca cliente_verificado=true en cuanto se obtiene un nombre real (no
 * el placeholder), para no repetir esta llamada a la API en cada aviso
 * posterior de la vida del pedido — solo hace falta una vez.
 */
async function refreshClienteAndMaybePrint(tenantId: string, orderRowId: string, tiktokOrderId: string): Promise<void> {
  try {
    const connection = await getValidAccessToken(tenantId);
    const shops = await getShopsForConnection(connection.id);
    for (const shop of shops) {
      const [order] = await getOrderDetails(toApiCredentials(connection), shop.shop_cipher, [tiktokOrderId]);
      if (!order) continue;
      const cliente = clienteFromOrder(order);
      // Sin nombre todavía — no se marca como verificado, para poder
      // reintentarlo en el siguiente aviso (o lo resuelve la red de
      // seguridad de force-print-stale-orders pasados 10 min).
      if (cliente === CLIENTE_DESCONOCIDO) return;

      // Visto en producción: un pedido detectado antes por la extensión
      // (raw_payload.source="chrome_extension") llegaba a este mismo aviso de
      // webhook una y otra vez (aquí, en processOrderStatusChange, por la
      // rama "ya existe") sin que raw_payload.source se corrigiera nunca a
      // "tiktok_shop_api" — a diferencia de ensureLocalOrder, que sí lo hace,
      // pero que solo se llama para pedidos NUEVOS, nunca para éstos. Como la
      // exportación diaria a Caja TikTok (y la pantalla "Pedidos (API)") solo
      // incluyen pedidos con source="tiktok_shop_api", esos pedidos —reales,
      // cobrados, con etiqueta impresa— quedaban excluidos para siempre de
      // Caja TikTok. Aquí, con el pedido ya confirmado por la API oficial, se
      // corrige el origen exactamente igual que hace ensureLocalOrder.
      const { data: fullOrder } = await supabaseAdmin
        .from("orders")
        .update({
          cliente,
          cliente_verificado: true,
          raw_payload: {
            source: "tiktok_shop_api",
            order_type: order.order_type,
            status: order.status,
            subtotal_cents: subtotalCentsFromOrder(order),
            user_id: order.user_id ?? null,
          },
        })
        .eq("id", orderRowId)
        .select("*")
        .single();
      if (fullOrder && fullOrder.impresiones_cobrables === 0) await claimAndChargePrint(fullOrder, tenantId);
      return;
    }
  } catch (err) {
    console.error(`[TikTok Shop] No se pudo refrescar el nombre del pedido ${tiktokOrderId}:`, err);
  }
}

async function processOrderStatusChange(tenantId: string, payload: TikTokOrderStatusChangePayload): Promise<void> {
  const orderId = payload.data?.order_id;
  if (!orderId) return;

  // ORDER_STATUS_CHANGE avisa de CUALQUIER cambio de estado del pedido
  // (pagado, enviado, entregado, completado...), no solo de que se acaba de
  // crear. Solo interesa la primera vez que vemos este pedido — si ya
  // existe en nuestra tabla, es que TikTok ha tocado un pedido que ya
  // conocíamos (p. ej. lo marca como "completado" semanas después de la
  // subasta) y no debe cobrarse/imprimirse por eso. Se comprueba esto ANTES
  // de gastar una llamada a la API de TikTok, no solo por eficiencia: es la
  // regla de negocio real (confirmado con el cliente: solo pedidos nuevos
  // de un directo en marcha, los cambios de estado posteriores no afectan).
  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id, cliente, cliente_verificado")
    .eq("tenant_id", tenantId)
    .eq("external_order_id", orderId)
    .maybeSingle();
  if (existing) {
    // Se aprovecha este aviso posterior (normalmente el cambio a
    // pagado/enviado, segundos o minutos después de crearse el pedido) para
    // volver a comprobar el nombre UNA vez más — cubre tanto el caso de
    // CLIENTE_DESCONOCIDO (dirección aún vacía) como el de un nombre
    // provisional que TikTok cambia poco después (ver
    // refreshClienteAndMaybePrint) — sin cobrar ni imprimir de nuevo.
    if (!existing.cliente_verificado) await refreshClienteAndMaybePrint(tenantId, existing.id, orderId);
    return;
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("auto_print_enabled")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant?.auto_print_enabled) return;

  const connection = await getValidAccessToken(tenantId);
  const shops = await getShopsForConnection(connection.id);
  const shop = shops.find((s) => s.shop_id === payload.shop_id);
  if (!shop) return;

  const [order] = await getOrderDetails(toApiCredentials(connection), shop.shop_cipher, [orderId]);
  if (!order || order.order_type !== "AUCTION") return;

  const local = await ensureLocalOrder(tenantId, orderId, { shopId: shop.shop_id, prefetchedOrder: order });

  // "Primera vez que vemos este pedido" no siempre significa "recién
  // creado" — TikTok puede tocar (p. ej. completar) un pedido de semanas
  // atrás que, por lo que sea, nunca nos había llegado antes, y eso también
  // pasaría la comprobación de "existing" de arriba. Se registra igual (para
  // poder imprimirlo a mano si hace falta) pero no se cobra/imprime solo si
  // el pedido no es de las últimas 48h — un pedido de un directo en marcha
  // siempre lo será.
  const MAX_AUTO_PRINT_AGE_MS = 48 * 60 * 60 * 1000;
  const orderAgeMs = Date.now() - order.create_time * 1000;
  if (orderAgeMs > MAX_AUTO_PRINT_AGE_MS) {
    console.warn(
      `[TikTok Shop] Pedido ${orderId} visto por primera vez pero con ${(orderAgeMs / 3_600_000).toFixed(0)}h de antigüedad — no se cobra/imprime automáticamente.`
    );
    return;
  }

  // TikTok puede no tener todavía la dirección de envío rellena en el
  // instante de este primer aviso (visto en producción) — se prefiere
  // esperar al siguiente aviso (normalmente segundos o minutos después, el
  // cambio a pagado/enviado) antes que cobrar/imprimir una etiqueta con el
  // nombre en blanco. El pedido ya queda guardado (ensureLocalOrder de
  // arriba); refreshClienteAndMaybePrint es quien completa el cobro/
  // impresión en cuanto haya nombre.
  if (clienteFromOrder(order) === CLIENTE_DESCONOCIDO) return;

  const { data: fullOrder } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", local.id)
    .single();
  if (!fullOrder) return;

  // claimAndChargePrint ya es idempotente (no cobra dos veces un pedido con
  // impresiones_cobrables > 0) — se mantiene como respaldo por si hubiera
  // una carrera justo aquí, aunque la comprobación de "existing" de arriba
  // ya cubre el caso normal.
  await claimAndChargePrint(fullOrder, tenantId);
}
