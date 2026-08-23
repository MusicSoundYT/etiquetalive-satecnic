import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { getDailyPrintSummary } from "@/lib/print-summary/daily-print-summary";
import { getMonthlyBillingSummary, type MonthlyBillingSummary } from "@/lib/admin/monthly-billing-summary";
import { todayMadridDate } from "@/lib/utils/madrid-date";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram/send-telegram-message";

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
    // Mes en curso (Europe/Madrid) - se calcula al vuelo por rango de fechas,
    // así que se resetea solo cada día 1, sin ningún contador que limpiar a mano.
    const [year, month] = todayMadridDate().split("-").map(Number);
    const billing = await getMonthlyBillingSummary(year, month);
    await sendTelegramMessage(`${formatSummaryMessage(summary)}\n\n${formatBillingMessage(billing)}`);
    return NextResponse.json({ summary, billing });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    console.error("[Resumen de impresiones] Error generando el resumen diario:", err);
    await sendTelegramMessage(`🚨 <b>Resumen de impresiones</b>\nHa fallado la generación del resumen diario — ${escapeHtml(message)}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function formatSummaryMessage(summary: Awaited<ReturnType<typeof getDailyPrintSummary>>): string {
  if (!summary.total) return `🏷️ <b>Etiquetas impresas — ${escapeHtml(summary.date)}</b>\nNinguna.`;
  const lines = summary.rows.map((r) => `• ${escapeHtml(r.tenantName)}: <b>${r.count}</b>`);
  return `🏷️ <b>Etiquetas impresas — ${escapeHtml(summary.date)}</b>\nTotal: <b>${summary.total}</b>\n\n${lines.join("\n")}`;
}

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";
}

function formatBillingMessage(billing: MonthlyBillingSummary): string {
  const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(billing.year, billing.month - 1, 1))
  );
  return (
    `💰 <b>Facturación — ${escapeHtml(monthName)}</b>\n` +
    `🏷️ Etiquetas: <b>${billing.ordersCount}</b>\n` +
    `💳 Recargado: <b>${formatEuros(billing.rechargedCents)}</b>\n` +
    `📄 Facturado: <b>${formatEuros(billing.totalCents)}</b>\n` +
    `⚠️ Deuda pendiente: <b>${formatEuros(billing.pendingDebtCents)}</b>`
  );
}
