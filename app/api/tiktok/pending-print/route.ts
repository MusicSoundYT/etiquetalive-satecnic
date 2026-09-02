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
// reciente sin arrastrar horas de historial.
const DEVICE_BROADCAST_WINDOW_MS = 15 * 60 * 1000;

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
    const since = new Date(Date.now() - DEVICE_BROADCAST_WINDOW_MS).toISOString();
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

    const { data: candidates } = await query.order("fecha_detectado", { ascending: true }).limit(MAX_PER_POLL);

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
