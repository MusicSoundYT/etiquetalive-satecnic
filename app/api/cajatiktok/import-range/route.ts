import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { exportAuctionOrdersForRange } from "@/lib/cajatiktok-export/export-daily-auction-orders";

// Llamado por la Edge Function "tiktok-bridge" de Caja TikTok (nunca
// directamente desde su navegador) cuando alguien elige un rango de
// fecha/hora en la pantalla de "Importar sesión de TikTok".
export async function POST(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { startUtc?: string; endUtc?: string; nombreArchivo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  if (!body.startUtc || !body.endUtc) {
    return NextResponse.json({ error: "Faltan startUtc/endUtc." }, { status: 400 });
  }

  try {
    const result = await exportAuctionOrdersForRange(body.startUtc, body.endUtc, body.nombreArchivo);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Caja TikTok] Error en la importación por rango:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
