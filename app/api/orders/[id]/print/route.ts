import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveTenantContext } from "@/lib/auth/tenant-context";
import { adjustBalance, getPriceCentsForTier, getUserBalance } from "@/lib/wallet/ledger";
import { maybeAutoRecharge } from "@/lib/wallet/auto-recharge";
import { verifyRequestSignature } from "@/lib/auth/verify-signature";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawBody = await req.text();
  const ctx = await resolveTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  if (!ctx.userId) {
    const apiKey = req.headers.get("x-api-key") ?? "";
    const signature = req.headers.get("x-el-sign");
    if (!verifyRequestSignature(rawBody, signature, apiKey)) {
      return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
    }
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });

  // Reclamo atómico: solo la petición que consigue pasar impresiones_cobrables
  // de 0 a 1 procede a cobrar. Evita doble cobro por condición de carrera si
  // llegan dos "print" concurrentes para el mismo pedido (p. ej. reinstalación
  // de la extensión disparando un reintento a la vez que el dashboard).
  const { data: claimed } = await supabaseAdmin
    .from("orders")
    .update({
      impresiones_cobrables: 1,
      estado_impresion: order.estado_impresion === "detectado" ? "impreso" : order.estado_impresion,
      fecha_impresion: order.fecha_impresion ?? new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("impresiones_cobrables", 0)
    .select("*")
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json({ order, charged: false, reason: "already_charged_first_print" });
  }

  const { data: owner } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .limit(1)
    .single();
  if (!owner) return NextResponse.json({ error: "Tenant sin usuario asociado." }, { status: 500 });

  const balance = await getUserBalance(owner.id);

  // Cuentas DEMO (activadas por un admin en el panel): imprimen sin límite,
  // sin descontar saldo real y sin comprobar bloqueo. El pedido ya ha quedado
  // marcado como impreso/cobrable arriba, así que la etiqueta se sirve igual.
  if (balance?.is_demo) {
    return NextResponse.json({ order: claimed, charged: false, reason: "demo_account", priceCents: 0 });
  }

  if (balance?.is_blocked) {
    // El pedido ya quedó marcado como impreso/cobrable; se registra sin cobrar
    // efectivamente y se informa del bloqueo (evita reintentos infinitos).
    return NextResponse.json(
      { error: balance.block_reason ?? "Cuenta bloqueada para impresión." },
      { status: 402 }
    );
  }

  const priceCents = await getPriceCentsForTier(balance?.current_tier ?? 1);

  await adjustBalance(owner.id, -priceCents, "label_consumption", {
    description: `Impresión ${order.tk}`,
    // OJO: no usar relatedDetectionId aquí — esa columna tiene una FK real
    // hacia la (obsoleta) tabla order_detections, no hacia nuestra tabla
    // "orders" nueva. Se guarda la trazabilidad en metadata en su lugar.
    metadata: { order_id: order.id },
  });

  await supabaseAdmin.from("orders_processed").insert({
    tenant_id: ctx.tenantId,
    external_order_id: order.external_order_id ?? order.tk,
    tk_number: order.tk,
    price_cents: priceCents,
    order_id: order.id,
  });

  await maybeAutoRecharge(owner.id);

  return NextResponse.json({ order: claimed, charged: true, priceCents });
}
