import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { handleBotCommand } from "@/lib/telegram/bot-commands";

/**
 * Webhook que Telegram llama cada vez que alguien manda un mensaje al bot.
 * Solo responde a comandos (/saldo, /consumototal...) para consultar datos
 * de clientes — por eso, a diferencia de sendTelegramMessage (que es opcional
 * y solo avisa), aquí SÍ se exige el secreto del webhook: expone datos
 * sensibles (saldo, MFA...), no es solo un aviso de salida.
 *
 * Configurar el webhook una vez (no lo hace este código, es un comando
 * aparte contra la API de Telegram):
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://etiquetalivetiktok.satecnic.es/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

async function replyToChat(chatId: number | string, text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch (err) {
    console.error("[Telegram webhook] Error respondiendo:", err);
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedChatId = process.env.TELEGRAM_CHAT_ID;
  if (!webhookSecret || !botToken || !allowedChatId) {
    // Sin esto configurado, no hay forma segura de servir el webhook — se
    // devuelve 200 igualmente (Telegram no debe reintentar en bucle) pero
    // no se procesa nada.
    console.warn("[Telegram webhook] Faltan TELEGRAM_WEBHOOK_SECRET/TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID.");
    return NextResponse.json({ ok: true });
  }

  const providedSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!timingSafeEqualStrings(providedSecret, webhookSecret)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let update: { message?: { chat?: { id?: number }; text?: string } };
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text;
  if (chatId == null || !text) return NextResponse.json({ ok: true });

  // Solo se atiende el chat ya configurado como destino de los avisos —
  // cualquier otro chat que descubra el bot no debe poder consultar saldo,
  // MFA, etc. de los clientes.
  if (String(chatId) !== String(allowedChatId)) {
    return NextResponse.json({ ok: true });
  }

  const reply = await handleBotCommand(text);
  await replyToChat(chatId, reply);

  return NextResponse.json({ ok: true });
}
