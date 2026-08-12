import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { getOrderDetails } from "@/lib/tiktok-shop/api-client";
import { mapTikTokStatusToEstadoEnvio } from "@/lib/cajatiktok-export/status-mapping";
import { CAJATIKTOK_TENANT_ID } from "@/lib/cajatiktok-export/tenant";

// Consulta el estado REAL de un pedido concreto, en el momento, para el
// chequeo en vivo al escanear en Caja TikTok (vía la Edge Function
// "tiktok-bridge") — no lee de nuestra base de datos, pregunta a TikTok.
export async function GET(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el parámetro id." }, { status: 400 });

  try {
    const connection = await getValidAccessToken(CAJATIKTOK_TENANT_ID);
    const shops = await getShopsForConnection(connection.id);
    if (!shops.length) throw new Error("No hay ninguna tienda de TikTok Shop conectada.");

    for (const shop of shops) {
      const [order] = await getOrderDetails(toApiCredentials(connection), shop.shop_cipher, [id]);
      if (order) {
        return NextResponse.json({ status: order.status, estadoEnvio: mapTikTokStatusToEstadoEnvio(order.status) });
      }
    }
    return NextResponse.json({ error: "Pedido no encontrado en TikTok." }, { status: 404 });
  } catch (err) {
    console.error("[Caja TikTok] Error consultando el estado de un pedido:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
