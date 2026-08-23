import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getValidAccessToken } from "@/lib/tiktok-shop/connection";
import { sendTelegramMessage, escapeHtml } from "@/lib/telegram/send-telegram-message";

// El cobro/impresión automática por API depende por completo de que el
// access_token de cada conexión se pueda seguir renovando — si el
// refresh_token caduca o TikTok revoca el acceso, todo ese flujo se para en
// silencio (nadie lo nota hasta que falta un pedido). Este cron, disparado
// cada 30 min, intenta renovar cada conexión y avisa si falla.
export async function GET(req: NextRequest) {
  const cronSecret = requireCronSecret();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { data: connections, error } = await supabaseAdmin
    .from("tiktok_shop_connections")
    .select("id, tenant_id, seller_name, broken_notified_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { tenantId: string; ok: boolean }[] = [];

  for (const conn of connections ?? []) {
    try {
      await getValidAccessToken(conn.tenant_id as string);
      results.push({ tenantId: conn.tenant_id as string, ok: true });

      // Estaba rota y ahora funciona -> avisa de la recuperación y limpia
      // el cooldown, para que una rotura FUTURA vuelva a avisar.
      if (conn.broken_notified_at) {
        await sendTelegramMessage(
          `✅ <b>TikTok Shop reconectado</b>\nLa conexión de "${escapeHtml(String(conn.seller_name ?? conn.tenant_id))}" ha vuelto a funcionar.`
        );
        await supabaseAdmin.from("tiktok_shop_connections").update({ broken_notified_at: null }).eq("id", conn.id);
      }
    } catch (err) {
      results.push({ tenantId: conn.tenant_id as string, ok: false });
      const message = err instanceof Error ? err.message : "Error desconocido.";
      console.error(`[TikTok Shop] Conexión rota para el tenant ${conn.tenant_id}:`, err);

      // Ya se había avisado de esta misma rotura -> no repetir.
      if (conn.broken_notified_at) continue;

      await sendTelegramMessage(
        `🚨 <b>TikTok Shop desconectado</b>\nLa conexión de "${escapeHtml(String(conn.seller_name ?? conn.tenant_id))}" ha dejado de funcionar — ${escapeHtml(message)}\n\n⚠️ El cobro/impresión automático por API está parado hasta reconectar.`
      );
      await supabaseAdmin
        .from("tiktok_shop_connections")
        .update({ broken_notified_at: new Date().toISOString() })
        .eq("id", conn.id);
    }
  }

  return NextResponse.json({ checked: results.length, broken: results.filter((r) => !r.ok).length });
}
