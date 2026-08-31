import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { exportDailyAuctionOrders, getGroupMemberEmails } from "@/lib/cajatiktok-export/export-daily-auction-orders";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram/send-telegram-message";
import { sendCajaTiktokImportSuccessEmail } from "@/lib/mail/send-cajatiktok-import-success-email";
import { sendCajaTiktokImportErrorCustomerEmail, sendCajaTiktokImportErrorAdminEmail } from "@/lib/mail/send-cajatiktok-import-error-emails";

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
        // Al equipo del grupo, aviso genérico (no es cosa suya arreglarlo);
        // a soporte, el detalle completo para poder investigarlo. Un fallo
        // aquí no debe tumbar el resto del cron — se registra y se sigue
        // con el siguiente grupo.
        try {
          const emails = await getGroupMemberEmails(result.grupoNombre);
          await sendCajaTiktokImportErrorCustomerEmail(emails, { grupoNombre: result.grupoNombre, date: result.date });
          await sendCajaTiktokImportErrorAdminEmail({ grupoNombre: result.grupoNombre, date: result.date, errorMessage: result.error });
        } catch (mailErr) {
          console.error(`[Caja TikTok] No se pudieron enviar los correos de error para ${result.grupoNombre}:`, mailErr);
        }
      } else if (result.skipped) {
        await sendTelegramMessage(`ℹ️ <b>Caja TikTok — ${grupo}</b>\nSin pedidos de subasta que exportar del ${escapeHtml(result.date)} (no hubo directo).`);
      } else {
        await sendTelegramMessage(
          `✅ <b>Caja TikTok — ${grupo}</b>\n${escapeHtml(result.date)}: <b>${result.totalOrders}</b> pedidos de subasta · <b>${result.totalClients}</b> clientas`
        );
        try {
          const emails = await getGroupMemberEmails(result.grupoNombre);
          await sendCajaTiktokImportSuccessEmail(emails, {
            grupoNombre: result.grupoNombre,
            date: result.date,
            totalOrders: result.totalOrders,
            totalClients: result.totalClients,
          });
        } catch (mailErr) {
          console.error(`[Caja TikTok] No se pudo enviar el correo de importación correcta para ${result.grupoNombre}:`, mailErr);
        }
      }
    }
    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    console.error("[Caja TikTok] Error en la exportación diaria:", err);
    await sendTelegramMessage(`🚨 <b>Caja TikTok</b>\nHa fallado la exportación diaria — ${escapeHtml(message)}`);
    // Aquí ha fallado ANTES de tener resultados por grupo (p. ej. un fallo
    // de conexión general) — no hay a quién avisar por cliente, pero
    // soporte sí debe enterarse con el detalle completo igualmente.
    await sendCajaTiktokImportErrorAdminEmail({
      grupoNombre: "(todos los grupos — fallo general)",
      date: date ?? "hoy",
      errorMessage: err instanceof Error ? (err.stack ?? err.message) : message,
    }).catch((mailErr) => console.error("[Caja TikTok] No se pudo enviar el correo de error general a soporte:", mailErr));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
