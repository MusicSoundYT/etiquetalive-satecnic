import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { createShippingPackage, getPackageShippingDocument, type TikTokApiCredentials } from "@/lib/tiktok-shop/api-client";
import { findByGrupoNombre } from "@/lib/cajatiktok-export/tenant";

type LabelResult = { orderId: string; docUrl?: string; alreadyShipped?: boolean; error?: string };

/**
 * Genera la etiqueta de envío de cada pedido recibido — piloto de Caja
 * TikTok, vía la Edge Function "tiktok-bridge" (que ya resuelve el grupo del
 * que llama a partir de su sesión, así que aquí solo hace falta confiar en
 * el grupoNombre recibido).
 *
 * TikTok solo acepta UN pedido por paquete (confirmado en producción: ni un
 * array ni varios IDs separados por comas funcionan en "order_id"), así que
 * de momento se genera un PDF por pedido en vez de uno unificado — pendiente
 * de encontrar el campo real para combinarlos (necesita documentación de
 * TikTok que no ha sido posible consultar). Un fallo en un pedido no debe
 * impedir que se generen los demás.
 *
 * Detrás de un interruptor por tenant (tenants.shipping_label_api_enabled)
 * para poder desactivarlo sin desplegar nada si da problemas durante la
 * prueba con Woow Insólito y MagicDays.
 */
export async function POST(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { grupoNombre?: string; orderIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const { grupoNombre, orderIds } = body;
  if (!grupoNombre || !Array.isArray(orderIds) || !orderIds.length) {
    return NextResponse.json({ error: "Faltan grupoNombre u orderIds." }, { status: 400 });
  }

  const pair = findByGrupoNombre(grupoNombre);
  if (!pair) {
    return NextResponse.json({ error: `No hay ningún cliente configurado para el grupo "${grupoNombre}".` }, { status: 400 });
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("shipping_label_api_enabled")
    .eq("id", pair.tenantId)
    .maybeSingle();
  if (!tenant?.shipping_label_api_enabled) {
    return NextResponse.json({ error: "La generación de etiqueta de envío no está activada para este cliente." }, { status: 403 });
  }

  let credentials: TikTokApiCredentials;
  let shopCipher: string;
  try {
    const connection = await getValidAccessToken(pair.tenantId);
    const shops = await getShopsForConnection(connection.id);
    if (!shops.length) throw new Error("No hay ninguna tienda de TikTok Shop conectada.");
    shopCipher = shops[0].shop_cipher;
    credentials = toApiCredentials(connection);
  } catch (err) {
    console.error("[Caja TikTok] Error obteniendo la conexión de TikTok Shop:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }

  const results: LabelResult[] = [];
  for (const orderId of orderIds) {
    try {
      const pkg = await createShippingPackage(credentials, shopCipher, orderId);
      const doc = await getPackageShippingDocument(credentials, shopCipher, pkg.package_id);
      results.push({ orderId, docUrl: doc.doc_url });
    } catch (err) {
      // TikTok rechaza con este código si el pedido ya se envió antes (por
      // ejemplo, a mano desde Seller Center) — no es un fallo, solo
      // significa que ya no hace falta generar nada nuevo para ese pedido.
      const message = err instanceof Error ? err.message : "Error desconocido.";
      if (message.includes("code 21011006") || message.includes("already shipped")) {
        results.push({ orderId, alreadyShipped: true });
      } else {
        console.error(`[Caja TikTok] Error generando etiqueta de envío del pedido ${orderId}:`, err);
        results.push({ orderId, error: message });
      }
    }
  }

  return NextResponse.json({ results });
}
