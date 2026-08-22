import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { createShippingPackage, getPackageShippingDocument } from "@/lib/tiktok-shop/api-client";
import { findByGrupoNombre } from "@/lib/cajatiktok-export/tenant";

/**
 * Genera (o reutiliza) la etiqueta de envío unificada de uno o varios
 * pedidos del mismo cliente — piloto de Caja TikTok, vía la Edge Function
 * "tiktok-bridge" (que ya resuelve el grupo del que llama a partir de su
 * sesión, así que aquí solo hace falta confiar en el grupoNombre recibido).
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

  try {
    const connection = await getValidAccessToken(pair.tenantId);
    const shops = await getShopsForConnection(connection.id);
    if (!shops.length) throw new Error("No hay ninguna tienda de TikTok Shop conectada.");
    const shop = shops[0];
    const credentials = toApiCredentials(connection);

    const pkg = await createShippingPackage(credentials, shop.shop_cipher, orderIds);
    const doc = await getPackageShippingDocument(credentials, shop.shop_cipher, pkg.package_id);

    return NextResponse.json({ packageId: pkg.package_id, docUrl: doc.doc_url });
  } catch (err) {
    console.error("[Caja TikTok] Error generando etiqueta de envío:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
