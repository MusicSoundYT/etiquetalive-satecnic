import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { getPackageShippingDocument, type TikTokApiCredentials } from "@/lib/tiktok-shop/api-client";
import { findByGrupoNombre } from "@/lib/cajatiktok-export/tenant";
import { mergeShippingLabelPdfs } from "@/lib/tiktok-shop/merge-shipping-labels";

type ReprintResult = { orderId: string; docUrl?: string; error?: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Vuelve a pedir el documento de envío (PDF) de un pedido cuya etiqueta ya
 * se generó antes con éxito (generate-shipping-label). El paquete ya está
 * creado y enviado en TikTok en ese caso, así que aquí NO se vuelve a crear
 * ni a enviar nada — solo se pide de nuevo el mismo documento con el
 * package_id que ya se guardó la primera vez. Evita duplicar envíos: quien
 * llame a esto debe mandar el package_id real de cada pedido, nunca uno
 * inventado.
 */
export async function POST(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { grupoNombre?: string; orders?: Array<{ orderId?: string; packageId?: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const { grupoNombre, orders } = body;
  if (!grupoNombre || !Array.isArray(orders) || !orders.length) {
    return NextResponse.json({ error: "Faltan grupoNombre u orders." }, { status: 400 });
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

  const results: ReprintResult[] = [];
  for (const { orderId, packageId } of orders) {
    if (!orderId || !packageId) {
      results.push({ orderId: orderId ?? "?", error: "Falta el package_id de este pedido." });
      continue;
    }
    try {
      let doc;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          doc = await getPackageShippingDocument(credentials, shopCipher, packageId);
          break;
        } catch (docErr) {
          if (attempt === 3) throw docErr;
          await sleep(1500);
        }
      }
      if (!doc) throw new Error("No se pudo obtener el documento de envío.");
      results.push({ orderId, docUrl: doc.doc_url });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      console.error(`[Caja TikTok] Error reimprimiendo la etiqueta del pedido ${orderId}:`, err);
      results.push({ orderId, error: message });
    }
  }

  // Un cliente con 2+ pedidos quiere UN solo PDF con todas sus etiquetas
  // dentro, no una pestaña por pedido — se unen aquí, en el servidor (ya
  // tenemos los doc_url a mano). Si algo falla al unirlas (una URL no
  // descarga, un PDF viene raro...), se sigue devolviendo cada docUrl por
  // separado como hasta ahora — nunca debe perderse una etiqueta por un
  // fallo al fusionar, es solo una comodidad de más.
  const docUrls = results.filter((r) => r.docUrl).map((r) => r.docUrl!);
  let mergedDocBase64: string | undefined;
  if (docUrls.length > 1) {
    try {
      mergedDocBase64 = (await mergeShippingLabelPdfs(docUrls)).toString("base64");
    } catch (err) {
      console.error("[Caja TikTok] No se pudieron unir las etiquetas reimpresas en un solo PDF:", err);
    }
  }

  return NextResponse.json({ results, mergedDocBase64 });
}
