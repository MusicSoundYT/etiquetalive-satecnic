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

export async function GET(req: NextRequest) {
  const cronSecret = requireCronSecret();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data: stale, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("cliente", CLIENTE_DESCONOCIDO)
    .eq("impresiones_cobrables", 0)
    .lt("fecha_detectado", staleBefore);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let printed = 0;
  for (const order of stale ?? []) {
    const result = await claimAndChargePrint(order, order.tenant_id as string);
    if (result.status === "charged" || result.status === "demo") printed++;
  }

  return NextResponse.json({ checked: stale?.length ?? 0, printed });
}
