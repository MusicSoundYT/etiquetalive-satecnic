import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { createShippingPackage, shipPackage, getPackageShippingDocument, getOrderDetails, type TikTokApiCredentials } from "@/lib/tiktok-shop/api-client";
import { findByGrupoNombre } from "@/lib/cajatiktok-export/tenant";
import { mergeShippingLabelPdfs } from "@/lib/tiktok-shop/merge-shipping-labels";

type LabelResult = { orderId: string; docUrl?: string; packageId?: string; alreadyShipped?: boolean; error?: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Genera la etiqueta de envío de cada pedido recibido — piloto de Caja
 * TikTok, vía la Edge Function "tiktok-bridge" (que ya resuelve el grupo del
 * que llama a partir de su sesión, así que aquí solo hace falta confiar en
 * el grupoNombre recibido).
 *
 * Tres pasos por pedido, en este orden (confirmados contra la API real con
 * un pedido de producción — el fallo original era que faltaba el paso 2):
 *   1. Crear el paquete — o reutilizar el que TikTok ya haya creado él solo
 *      (pasa siempre en pedidos con su propia logística, que es lo habitual
 *      aquí: comprobado que el paquete ya existe en cuanto el pedido está
 *      listo para enviar, y volver a "crearlo" falla con un "Internal
 *      error" genérico).
 *   2. Enviarlo (shipPackage) — el paso que faltaba del todo. Sin esto, el
 *      documento de envío siempre daba "Documents couldn't be printed
 *      before shipped", por mucho que el paquete ya existiera.
 *   3. Pedir el documento de envío — puede tardar unos segundos en estar
 *      listo justo después de enviarlo, así que se reintenta con una
 *      pequeña espera en vez de darlo por fallido a la primera.
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
    let packageId: string | undefined;
    try {
      // 1. Paquete: reutilizar el que TikTok ya haya creado él solo (lo
      // habitual en pedidos con su propia logística) en vez de intentar
      // crear uno nuevo, que falla si ya existe.
      const [orderDetail] = await getOrderDetails(credentials, shopCipher, [orderId]);
      packageId = orderDetail?.packages?.[0]?.id;
      if (!packageId) {
        const pkg = await createShippingPackage(credentials, shopCipher, orderId);
        packageId = pkg.package_id;
      }

      // 2. Enviarlo. Si ya estaba enviado (por ejemplo a mano desde Seller
      // Center) TikTok lo rechaza con un código de "ya enviado" — no es un
      // fallo, seguimos igualmente a pedir el documento.
      try {
        await shipPackage(credentials, shopCipher, packageId);
      } catch (shipErr) {
        const shipMessage = shipErr instanceof Error ? shipErr.message : "Error desconocido.";
        const alreadyShipped = shipMessage.includes("code 21011006") || shipMessage.includes("already shipped");
        if (!alreadyShipped) throw shipErr;
      }

      // 3. Documento de envío — puede tardar unos segundos en estar listo
      // justo después de enviarlo, así que se reintenta un par de veces
      // antes de darlo por fallido.
      const NOT_READY_CODE = "code 21042104";
      let doc;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          doc = await getPackageShippingDocument(credentials, shopCipher, packageId);
          break;
        } catch (docErr) {
          const docMessage = docErr instanceof Error ? docErr.message : "Error desconocido.";
          if (attempt === 5 || !docMessage.includes(NOT_READY_CODE)) throw docErr;
          await sleep(3000);
        }
      }
      if (!doc) throw new Error("No se pudo obtener el documento de envío.");
      results.push({ orderId, docUrl: doc.doc_url, packageId });
    } catch (err) {
      // TikTok rechaza con este código si el pedido ya se envió antes (por
      // ejemplo, a mano desde Seller Center) — no es un fallo, solo
      // significa que ya no hace falta generar nada nuevo para ese pedido.
      const message = err instanceof Error ? err.message : "Error desconocido.";
      if (message.includes("code 21011006") || message.includes("already shipped")) {
        results.push({ orderId, packageId, alreadyShipped: true });
      } else if (message.includes("code 98001004") || message.includes("wrong order_id")) {
        // TikTok combina automáticamente varios pedidos del mismo comprador
        // en un solo envío antes de despacharlos (confirmado en producción:
        // un pedido cuyos artículos acaban repartidos en el envío de otro
        // pedido deja de existir como tal para esta API). No hay nada que
        // reintentar aquí — ese pedido concreto ya se envió como parte de
        // otro, hay que revisarlo a mano en Seller Center.
        results.push({
          orderId,
          error:
            "TikTok combinó este pedido con otro del mismo comprador antes de enviarlo, así que ya no existe por separado. Revísalo en Seller Center — seguramente ya está enviado dentro de otro paquete.",
        });
      } else {
        console.error(`[Caja TikTok] Error generando etiqueta de envío del pedido ${orderId}:`, err);
        results.push({ orderId, error: message });
      }
    }
  }

  // Un cliente con 2+ pedidos quiere UN solo PDF con todas sus etiquetas
  // dentro, no una pestaña por pedido — se unen aquí, en el servidor (ya
  // tenemos los doc_url a mano). Si algo falla al unirlas, se sigue
  // devolviendo cada docUrl por separado como hasta ahora — nunca debe
  // perderse una etiqueta por un fallo al fusionar, es solo una comodidad
  // de más.
  const docUrls = results.filter((r) => r.docUrl).map((r) => r.docUrl!);
  let mergedDocBase64: string | undefined;
  if (docUrls.length > 1) {
    try {
      mergedDocBase64 = (await mergeShippingLabelPdfs(docUrls)).toString("base64");
    } catch (err) {
      console.error("[Caja TikTok] No se pudieron unir las etiquetas generadas en un solo PDF:", err);
    }
  }

  return NextResponse.json({ results, mergedDocBase64 });
}
