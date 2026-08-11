import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getValidAccessToken, getShopsForConnection } from "@/lib/tiktok-shop/connection";
import { getOrderDetails } from "@/lib/tiktok-shop/api-client";
import { mapTikTokStatusToEstadoEnvio } from "@/lib/cajatiktok-export/status-mapping";

// Consulta el estado REAL de un pedido concreto, en el momento, para el
// chequeo en vivo al escanear en Caja TikTok (vía la Edge Function
// "tiktok-bridge") — no lee de nuestra base de datos, pregunta a TikTok.
export async function GET(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el parámetro id." }, { status: 400 });

  try {
    const { data: connectionRow, error: connectionErr } = await supabaseAdmin
      .from("tiktok_shop_connections")
      .select("tenant_id")
      .limit(1)
      .maybeSingle();
    if (connectionErr) throw new Error(connectionErr.message);
    if (!connectionRow) throw new Error("No hay ninguna conexión de TikTok Shop configurada todavía.");

    const connection = await getValidAccessToken(connectionRow.tenant_id as string);
    const shops = await getShopsForConnection(connection.id);
    if (!shops.length) throw new Error("No hay ninguna tienda de TikTok Shop conectada.");

    for (const shop of shops) {
      const [order] = await getOrderDetails(connection.access_token, shop.shop_cipher, [id]);
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
