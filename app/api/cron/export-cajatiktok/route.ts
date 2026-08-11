import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { exportDailyAuctionOrders } from "@/lib/cajatiktok-export/export-daily-auction-orders";
import { sendTelegramMessage } from "@/lib/telegram/send-telegram-message";

// Pensado para ser llamado por un disparador externo (no hay Vercel Cron en
// este hosting) una vez al día a las 08:00 Europe/Madrid. Protegido por
// CRON_SECRET en vez de sesión, porque no hay ningún usuario logueado.
export async function GET(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  const provided = req.nextUrl.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== cronSecret) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") ?? undefined;

  try {
    const result = await exportDailyAuctionOrders(date);
    // Solo se avisa si de verdad se ha exportado algo — un día sin
    // subastas (skipped) no es una novedad que merezca un aviso.
    if (!result.skipped) {
      await sendTelegramMessage(
        `✅ Caja TikTok: exportados ${result.totalOrders} pedidos de subasta (${result.totalClients} clientas) del ${result.date}.`
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    console.error("[Caja TikTok] Error en la exportación diaria:", err);
    await sendTelegramMessage(`🚨 Caja TikTok: ha fallado la exportación diaria — ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
