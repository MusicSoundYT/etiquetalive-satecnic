import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { exportAuctionOrdersForRange } from "@/lib/cajatiktok-export/export-daily-auction-orders";
import { findByGrupoNombre } from "@/lib/cajatiktok-export/tenant";

// Llamado por la Edge Function "tiktok-bridge" de Caja TikTok (nunca
// directamente desde su navegador) cuando alguien elige un rango de
// fecha/hora en la pantalla de "Importar sesión de TikTok". La Edge
// Function ya sabe a qué grupo pertenece quien llama (lo usa para su propio
// control de acceso) y lo manda aquí para saber a qué cliente corresponde.
export async function POST(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { startUtc?: string; endUtc?: string; nombreArchivo?: string; grupoNombre?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  if (!body.startUtc || !body.endUtc) {
    return NextResponse.json({ error: "Faltan startUtc/endUtc." }, { status: 400 });
  }
  const pair = body.grupoNombre ? findByGrupoNombre(body.grupoNombre) : undefined;
  if (!pair) {
    return NextResponse.json({ error: `No hay ningún cliente configurado para el grupo "${body.grupoNombre}".` }, { status: 400 });
  }

  try {
    // true: a diferencia de la exportación automática diaria, este endpoint
    // solo lo llama el botón manual "Importar sesión de TikTok" — quien lo
    // pulsa espera trabajar con ese Excel al momento, no tener que ir a
    // Historial de Excel a marcarlo activo a mano primero.
    const result = await exportAuctionOrdersForRange(pair, body.startUtc, body.endUtc, body.nombreArchivo, true);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Caja TikTok] Error en la importación por rango:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
