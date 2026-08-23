import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { exportDailyAuctionOrders } from "@/lib/cajatiktok-export/export-daily-auction-orders";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram/send-telegram-message";

// Pensado para ser llamado por un disparador externo (no hay Vercel Cron en
// este hosting) una vez al día a las 08:00 Europe/Madrid. Protegido por
// CRON_SECRET en vez de sesión, porque no hay ningún usuario logueado.
export async function GET(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") ?? undefined;

  try {
    const results = await exportDailyAuctionOrders(date);
    // Un aviso POR CADA cliente, con su nombre — así un "no se ha importado
    // nada" siempre deja claro de qué cuenta habla, y un fallo en uno no
    // oculta el resultado de los demás. Se avisa siempre, aunque no haya
    // nada que exportar — un silencio total nunca se puede confundir con
    // "el cron ni siquiera ha corrido".
    for (const result of results) {
      const grupo = escapeHtml(result.grupoNombre);
      if (result.error) {
        await sendTelegramMessage(`🚨 <b>Caja TikTok — ${grupo}</b>\nHa fallado la exportación diaria — ${escapeHtml(result.error)}`);
      } else if (result.skipped) {
        await sendTelegramMessage(`ℹ️ <b>Caja TikTok — ${grupo}</b>\nSin pedidos de subasta que exportar del ${escapeHtml(result.date)} (no hubo directo).`);
      } else {
        await sendTelegramMessage(
          `✅ <b>Caja TikTok — ${grupo}</b>\n${escapeHtml(result.date)}: <b>${result.totalOrders}</b> pedidos de subasta · <b>${result.totalClients}</b> clientas`
        );
      }
    }
    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    console.error("[Caja TikTok] Error en la exportación diaria:", err);
    await sendTelegramMessage(`🚨 <b>Caja TikTok</b>\nHa fallado la exportación diaria — ${escapeHtml(message)}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
