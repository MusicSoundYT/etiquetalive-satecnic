import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { approveReturn, rejectReturn, type TikTokApiCredentials } from "@/lib/tiktok-shop/api-client";
import { findByGrupoNombre } from "@/lib/cajatiktok-export/tenant";

/**
 * Aprueba o rechaza UNA devolución/cancelación — acción real e irreversible
 * contra TikTok (dispara o deniega el reembolso al comprador). Siempre
 * disparada a mano desde el panel, nunca automática — a petición explícita
 * del cliente mientras no se haya probado con casos reales.
 */
export async function POST(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { grupoNombre?: string; returnId?: string; decision?: "approve" | "reject"; rejectReason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const { grupoNombre, returnId, decision, rejectReason } = body;
  if (!grupoNombre || !returnId || !decision) {
    return NextResponse.json({ error: "Faltan grupoNombre, returnId o decision." }, { status: 400 });
  }
  if (decision === "reject" && !rejectReason?.trim()) {
    return NextResponse.json({ error: "Falta el motivo del rechazo." }, { status: 400 });
  }

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
    if (decision === "approve") {
      await approveReturn(credentials, shopCipher, returnId);
    } else {
      await rejectReturn(credentials, shopCipher, returnId, rejectReason!.trim());
    }
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error(`[Caja TikTok] Error decidiendo la devolución ${returnId}:`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido." }, { status: 500 });
  }
}
