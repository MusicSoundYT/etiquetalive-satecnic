import "server-only";

/**
 * Opcional a propósito (a diferencia del resto de lib/env.ts): si no está
 * configurado, los avisos simplemente no se mandan — no debe romper ningún
 * cron ni ninguna exportación real por faltar Telegram.
 */
function getTelegramConfig(): { botToken: string; chatId: string } | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

/**
 * Los mensajes usan HTML de Telegram (negrita, líneas separadas) para que
 * se lean mejor que un bloque de texto plano — cualquier dato variable
 * (nombre de cliente, email, mensaje de error...) que se meta dentro debe
 * pasar antes por escapeHtml, o un "<" o "&" suelto en un nombre real
 * rompería el formato del aviso entero.
 */
export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const config = getTelegramConfig();
  if (!config) {
    console.warn("[Telegram] No configurado (faltan TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID) — aviso no enviado:", text);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.error("[Telegram] Error enviando aviso:", res.status, await res.text());
    }
  } catch (err) {
    // Un aviso que no llega nunca debe tirar abajo el proceso que lo dispara.
    console.error("[Telegram] Error de red enviando aviso:", err);
  }
}
