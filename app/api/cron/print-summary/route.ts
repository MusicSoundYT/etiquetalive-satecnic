import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { getDailyPrintSummary } from "@/lib/print-summary/daily-print-summary";
import { sendTelegramMessage } from "@/lib/telegram/send-telegram-message";

// Pensado para el mismo disparador externo diario que ya usa
// export-cajatiktok, a las 08:00 Europe/Madrid. No tiene relación con Caja
// TikTok — es un resumen de impresiones de TODOS los clientes de
// EtiquetaLive, por eso vive aparte y solo depende de CRON_SECRET.
export async function GET(req: NextRequest) {
  const cronSecret = requireCronSecret();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") ?? undefined;

  try {
    const summary = await getDailyPrintSummary(date);
    await sendTelegramMessage(formatSummaryMessage(summary));
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    console.error("[Resumen de impresiones] Error generando el resumen diario:", err);
    await sendTelegramMessage(`🚨 Resumen de impresiones: ha fallado la generación del resumen diario — ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function formatSummaryMessage(summary: Awaited<ReturnType<typeof getDailyPrintSummary>>): string {
  if (!summary.total) return `🏷️ Etiquetas impresas el ${summary.date}: ninguna.`;
  const lines = summary.rows.map((r) => `• ${r.tenantName}: ${r.count}`);
  return `🏷️ Etiquetas impresas el ${summary.date} (${summary.total} en total):\n${lines.join("\n")}`;
}
