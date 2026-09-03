import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { searchReturns, type TikTokApiCredentials } from "@/lib/tiktok-shop/api-client";
import { computeReturnRecommendation } from "@/lib/tiktok-shop/return-recommendation";
import { findByGrupoNombre } from "@/lib/cajatiktok-export/tenant";

/**
 * Devoluciones/cancelaciones pendientes de decisión — piloto solo para Woow
 * Insólito (la propia Edge Function "tiktok-bridge" ya restringe qué grupos
 * pueden llegar aquí, ver GRUPOS_DEVOLUCIONES_PERMITIDOS). Nunca cobra ni
 * ejecuta nada: solo lista y calcula qué haría la regla acordada, como
 * sugerencia — aprobar/rechazar de verdad es un paso aparte y manual
 * (returns-decide), a petición explícita del cliente.
 */
export async function POST(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { grupoNombre?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const { grupoNombre } = body;
  if (!grupoNombre) return NextResponse.json({ error: "Falta grupoNombre." }, { status: 400 });

  const pair = findByGrupoNombre(grupoNombre);
  if (!pair) {
    return NextResponse.json({ error: `No hay ningún cliente configurado para el grupo "${grupoNombre}".` }, { status: 400 });
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
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido." }, { status: 500 });
  }

  try {
    const { return_orders } = await searchReturns(credentials, shopCipher, {
      returnStatus: ["RETURN_OR_REFUND_REQUEST_PENDING"],
      pageSize: 50,
    });

    const results = [];
    for (const r of return_orders) {
      // El filtro return_type de TikTok no aplica de verdad (confirmado) —
      // se filtra aquí. Solo las cancelaciones puras (REFUND) tienen la
      // regla del cliente; las devoluciones físicas (RETURN_AND_REFUND)
      // siempre quedan a revisar a mano, no es lo mismo (implica un
      // producto en camino de vuelta, no solo perder gastos de envío).
      const recommendation =
        r.return_type === "REFUND"
          ? await computeReturnRecommendation(credentials, shopCipher, r.order_id).catch((err) => ({
              decision: "manual" as const,
              reason: err instanceof Error ? err.message : "No se pudo calcular la recomendación.",
            }))
          : { decision: "manual" as const, reason: "Es una devolución física (no una cancelación) — siempre a revisar a mano." };

      results.push({
        returnId: r.return_id,
        orderId: r.order_id,
        returnType: r.return_type,
        returnStatus: r.return_status,
        reason: r.return_reason_text || r.return_reason || null,
        role: r.role || null,
        createTime: r.create_time,
        deadline: r.seller_next_action_response?.[0]?.deadline ?? null,
        refundTotal: r.refund_amount?.refund_total ?? null,
        currency: r.refund_amount?.currency ?? null,
        products: (r.return_line_items || []).map((li) => li.product_name || li.sku_name || "").filter(Boolean),
        // Sale también fuera de "recommendation" (aunque venga de ahí) para
        // que el panel no tenga que fiarse de un campo anidado al registrar
        // la decisión en devoluciones_decisiones (lista negra informativa).
        buyerUserId: "buyerUserId" in recommendation ? recommendation.buyerUserId ?? null : null,
        recommendation,
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[Caja TikTok] Error listando devoluciones:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido." }, { status: 500 });
  }
}
