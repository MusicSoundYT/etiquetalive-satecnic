import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { searchOrders } from "@/lib/tiktok-shop/api-client";

/**
 * Botón de prueba de la Fase 1: llama de verdad a la API de TikTok Shop y
 * devuelve los pedidos tal cual los da TikTok, para confirmar que la
 * conexión funciona de principio a fin. No crea ni modifica nada en
 * nuestra base de datos — es solo lectura de comprobación.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  try {
    const connection = await getValidAccessToken(user.tenant_id);
    const shops = await getShopsForConnection(connection.id);
    if (!shops.length) {
      return NextResponse.json({ error: "No hay ninguna tienda autorizada todavía." }, { status: 404 });
    }

    const results = [];
    for (const shop of shops) {
      const data = await searchOrders(toApiCredentials(connection), shop.shop_cipher, { pageSize: 10 });
      results.push({
        shop: shop.shop_name || shop.shop_code || shop.shop_id,
        totalCount: data.total_count ?? null,
        orders: data.orders,
      });
    }

    return NextResponse.json({ shops: results });
  } catch (err) {
    console.error("[TikTok Shop] Error en la prueba de pedidos:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
