import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDefaultTemplate } from "@/lib/labels/get-default-template";
import { generateLabelHtml } from "@/lib/labels/render";
import { resolveExclusiveDevice } from "@/lib/orders/resolve-exclusive-device";

const MAX_PER_POLL = 5;
// Ventana de tiempo que se mira cuando hay dispositivos con "imprimir
// también en otros ordenadores" activado (device_id) — sin esto, activarlo
// por primera vez en un ordenador reimprimiría TODO el historial de pedidos
// cobrados desde siempre. Con esto, solo entra en juego lo detectado hace
// poco.
//
// 4 horas (valor original) resultó ser demasiado en la práctica: cada vez
// que se reinstala la extensión (o se activa/desactiva este interruptor por
// primera vez desde un navegador nuevo) se genera un id de dispositivo
// nuevo, y ese id "nunca ha entregado nada" a ojos del sistema — así que se
// le mandaba de golpe TODO lo cobrado en las últimas 4 horas, aunque ya se
// hubiera impreso antes por otra vía (visto en producción: una ráfaga de
// decenas de etiquetas viejas al activar el interruptor). Con un directo en
// marcha, 15 minutos es más que suficiente para no perder nada realmente
// reciente sin arrastrar horas de historial. Se aplica SOLO la primera vez
// que se ve un device_id (ver isFreshDevice más abajo) — nunca a uno que ya
// lleva un rato entregando etiquetas.
const DEVICE_BROADCAST_WINDOW_MS = 15 * 60 * 1000;
// Ventana para dispositivos que YA llevan un rato entregando etiquetas.
//
// Antes se usaba la misma ventana de 15 min para todos, siempre medida como
// "ahora menos 15 min" — un dispositivo que llevaba horas funcionando bien
// podía quedarse unos minutos sin poder preguntar a tiempo (un corte de red,
// el ordenador que se ralentiza un instante...) y, pasados esos 15 min,
// cualquier pedido ya cobrado que se le hubiera quedado pendiente
// desaparecía de su vista PARA SIEMPRE — la ventana es siempre móvil, así
// que ese pedido nunca volvía a entrar en ella. Visto en producción: Magic
// Days, dos estaciones simultáneas (directo del 3 de septiembre) — la única
// forma de recuperar esas etiquetas fue desactivar "imprimir también en
// otros ordenadores" (que no tiene ninguna ventana), perdiendo con eso la
// exclusividad entre las dos estaciones.
//
// 24 horas cubre de sobra cualquier directo sin arrastrar más que eso.
const ESTABLISHED_DEVICE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Consultado cada pocos segundos por la pestaña de Pedidos (API): devuelve
 * pedidos ya cobrados (impresiones_cobrables > 0) que todavía no se le han
 * entregado a ninguna impresora — vengan de donde vengan (extensión o
 * webhook automático).
 *
 * shop_id (opcional): cuando un tenant tiene varias tiendas de TikTok
 * conectadas (varias trabajadoras, cada una con la suya), sin este filtro
 * cualquier pestaña abierta con la misma cuenta de EtiquetaLive imprimía
 * los pedidos de TODAS las tiendas, no solo la de quien la tiene abierta.
 *
 * device_id (opcional): con "Imprimir también en otros ordenadores"
 * activado en Pedidos (API), cada ordenador manda un identificador propio
 * (compartido con la extensión vía device-bridge.js si está instalada, ver
 * TikTokPrintWatcher) y deja de competir por la exclusiva de
 * label_delivered_at — en su lugar, cada pedido se reparte así:
 *
 *   1. Si una sola estación ganó una subasta al mismo precio hace poco
 *      (resolveExclusiveDevice), el pedido se entrega SOLO a esa estación —
 *      cubre el caso de dos directos simultáneos en la misma tienda
 *      (mismo shop_id, no distinguible por la API de TikTok de ninguna otra
 *      forma) sin duplicar etiquetas.
 *   2. Si no hay coincidencia clara (cero, o dos estaciones al mismo precio
 *      a la vez), se entrega a TODOS los dispositivos activos como red de
 *      seguridad — nunca se pierde una etiqueta por no acertar quién ganó.
 *
 * Siempre dentro de la misma tienda (shop_id) que ese ordenador tenga
 * seleccionada, para no imprimir etiquetas de otro directo/tienda del mismo
 * tenant. Sin device_id, el comportamiento es exactamente el de siempre: un
 * pedido va a quien pregunte primero y solo a ese (reclamo atómico vía
 * label_delivered_at IS NULL) — así esta vía también sirve de red de
 * seguridad si la extensión cobra un pedido pero falla al imprimirlo.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const shopId = req.nextUrl.searchParams.get("shop_id");
  const deviceId = req.nextUrl.searchParams.get("device_id");

  const template = await getDefaultTemplate(user.tenant_id);
  const results: { id: string; tk: string; label_html: string }[] = [];

  if (deviceId) {
    // "Recién activado" = este device_id nunca ha recibido ninguna etiqueta
    // — solo a estos se les aplica la ventana corta (para no inundarlos con
    // horas de historial al activar el reparto por primera vez). En cuanto
    // ya se le ha entregado algo alguna vez, pasa a la ventana larga: nunca
    // debería perder un pedido cobrado por quedarse unos minutos sin poder
    // preguntar a tiempo.
    const { data: everDelivered } = await supabaseAdmin
      .from("order_print_deliveries")
      .select("order_id")
      .eq("device_id", deviceId)
      .limit(1);
    const isFreshDevice = !everDelivered?.length;
    const lookbackMs = isFreshDevice ? DEVICE_BROADCAST_WINDOW_MS : ESTABLISHED_DEVICE_LOOKBACK_MS;
    const since = new Date(Date.now() - lookbackMs).toISOString();

    const { data: alreadyDelivered } = await supabaseAdmin
      .from("order_print_deliveries")
      .select("order_id")
      .eq("device_id", deviceId)
      .gte("delivered_at", since);
    const excludeIds = (alreadyDelivered ?? []).map((d) => d.order_id as string);

    let query = supabaseAdmin
      .from("orders")
      .select("*")
      .eq("tenant_id", user.tenant_id)
      .gt("impresiones_cobrables", 0)
      .gte("fecha_detectado", since);
    if (shopId) query = query.eq("tiktok_shop_id", shopId);
    if (excludeIds.length) query = query.not("id", "in", `(${excludeIds.join(",")})`);

    // Descendente (lo más reciente primero) — a propósito, y NO por
    // casualidad. Con la ventana larga de 24h para dispositivos ya
    // establecidos (ver arriba), un directo con pedidos huérfanos de horas
    // antes (de una sesión anterior, cuyo dispositivo ya no existe) volvía a
    // ser candidato — y, en ascendente con LIMIT 5, esos huérfanos antiguos
    // ocupaban SIEMPRE las 5 plazas de cada sondeo, bloqueando para siempre
    // los pedidos nuevos del directo en marcha (visto en producción: Magic
    // Days, 3 de septiembre, justo tras desplegar la ventana de 24h — nada
    // del directo actual llegaba a imprimirse mientras esto estuvo así).
    // En descendente, un pedido recién cobrado siempre está entre los 5 más
    // recientes y se entrega en el siguiente sondeo (2s) — los huérfanos
    // antiguos se van recuperando solos en cuanto no haya nada más nuevo por
    // delante, sin bloquear nunca lo de ahora mismo.
    const { data: candidates } = await query.order("fecha_detectado", { ascending: false }).limit(MAX_PER_POLL);

    for (const candidate of candidates ?? []) {
      const subtotalCents = (candidate.raw_payload as { subtotal_cents?: number } | null)?.subtotal_cents;
      const exclusiveDevice = await resolveExclusiveDevice(user.tenant_id, subtotalCents, candidate.fecha_detectado as string);
      if (exclusiveDevice && exclusiveDevice !== deviceId) continue; // es claramente de otra estación, no la mía

      const { error: insertError } = await supabaseAdmin
        .from("order_print_deliveries")
        .insert({ order_id: candidate.id, device_id: deviceId });
      if (insertError) continue; // 23505: este mismo dispositivo ya se lo llevó (poll solapado)

      // Marca label_delivered_at solo si nadie lo había hecho ya — a título
      // informativo (paneles, "hace cuánto se imprimió"...), nunca bloquea a
      // otros dispositivos: la exclusiva real ahora vive en
      // order_print_deliveries, no aquí.
      if (!candidate.label_delivered_at) {
        await supabaseAdmin
          .from("orders")
          .update({ label_delivered_at: new Date().toISOString() })
          .eq("id", candidate.id)
          .is("label_delivered_at", null);
      }

      const html = await generateLabelHtml(candidate, template, { preview: false });
      results.push({ id: candidate.id, tk: candidate.tk, label_html: html });
    }

    return NextResponse.json({ orders: results });
  }

  let query = supabaseAdmin
    .from("orders")
    .select("id, cliente, fecha_detectado")
    .eq("tenant_id", user.tenant_id)
    .gt("impresiones_cobrables", 0)
    .is("label_delivered_at", null);
  if (shopId) query = query.eq("tiktok_shop_id", shopId);

  const { data: candidates } = await query.order("fecha_detectado", { ascending: true }).limit(MAX_PER_POLL);
  if (!candidates?.length) return NextResponse.json({ orders: [] });

  for (const candidate of candidates) {
    const { data: claimed } = await supabaseAdmin
      .from("orders")
      .update({ label_delivered_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .is("label_delivered_at", null)
      .select("*")
      .maybeSingle();
    if (!claimed) continue; // otra pestaña (o la extensión) se lo llevó primero

    const html = await generateLabelHtml(claimed, template, { preview: false });
    results.push({ id: claimed.id, tk: claimed.tk, label_html: html });
  }

  return NextResponse.json({ orders: results });
}
