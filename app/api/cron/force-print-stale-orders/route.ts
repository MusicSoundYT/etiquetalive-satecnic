import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CLIENTE_DESCONOCIDO } from "@/lib/tiktok-shop/auction-orders";
import { claimAndChargePrint } from "@/lib/orders/charge-print";

// El webhook (app/api/tiktok/webhooks) espera a tener el nombre real del
// cliente antes de cobrar/imprimir, en vez de imprimir al instante con
// CLIENTE_DESCONOCIDO — pero si por lo que sea TikTok nunca manda un aviso
// posterior para ese pedido, se quedaría sin imprimir para siempre, que es
// peor que una etiqueta con el nombre en blanco. Red de seguridad: pasados
// unos minutos sin nombre, se cobra/imprime igualmente.
const STALE_AFTER_MS = 10 * 60 * 1000;

// Aparte del caso de arriba, un pedido con el nombre YA correcto también
// puede quedarse sin cobrar/imprimir si claimAndChargePrint falla por un
// corte de conexión pasajero justo en el momento de reclamarlo (visto en
// producción varias veces, sin ningún error en los logs porque antes ese
// fallo se confundía con "ya lo cobró otra petición" — ver charge-print.ts).
// Reintentar aquí es seguro: si de verdad no hay saldo o la cuenta está
// bloqueada, claimAndChargePrint lo vuelve a rechazar sin cobrar nada.
const STALE_NAMED_AFTER_MS = 20 * 60 * 1000;

export async function GET(req: NextRequest) {
  const cronSecret = requireCronSecret();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const staleNamedBefore = new Date(Date.now() - STALE_NAMED_AFTER_MS).toISOString();
  const [{ data: staleUnnamed, error: unnamedError }, { data: staleNamed, error: namedError }] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("*")
      .eq("cliente", CLIENTE_DESCONOCIDO)
      .eq("impresiones_cobrables", 0)
      .lt("fecha_detectado", staleBefore),
    // Restringido a los pedidos del flujo de auto-impresión por API
    // (raw_payload.source) — los detectados por la extensión Chrome pueden
    // quedar legítimamente sin imprimir a propósito (p. ej. una detección
    // duplicada que el operador decide ignorar), así que no deben tocarse
    // aquí.
    supabaseAdmin
      .from("orders")
      .select("*")
      .neq("cliente", CLIENTE_DESCONOCIDO)
      .eq("impresiones_cobrables", 0)
      .eq("raw_payload->>source", "tiktok_shop_api")
      .lt("fecha_detectado", staleNamedBefore),
  ]);
  if (unnamedError) return NextResponse.json({ error: unnamedError.message }, { status: 500 });
  if (namedError) return NextResponse.json({ error: namedError.message }, { status: 500 });
  const stale = [...(staleUnnamed ?? []), ...(staleNamed ?? [])];

  let printed = 0;
  const errors: string[] = [];
  for (const order of stale) {
    try {
      const result = await claimAndChargePrint(order, order.tenant_id as string);
      if (result.status === "charged" || result.status === "demo") printed++;
    } catch (err) {
      // Un fallo puntual (p. ej. el mismo corte de conexión que dejó este
      // pedido atascado) no debe impedir que se reintenten el resto — se
      // recuperará solo en la siguiente pasada, dentro de 30 minutos.
      const message = err instanceof Error ? err.message : "Error desconocido.";
      console.error(`[force-print-stale-orders] Fallo cobrando ${order.tk}:`, err);
      errors.push(`${order.tk}: ${message}`);
    }
  }

  return NextResponse.json({ checked: stale.length, printed, errors: errors.length ? errors : undefined });
}
