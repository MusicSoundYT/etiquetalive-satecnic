import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adjustBalance, getPriceCentsForTier, getUserBalance } from "@/lib/wallet/ledger";
import { maybeAutoRecharge } from "@/lib/wallet/auto-recharge";
import { sendLowBalanceEmail } from "@/lib/mail/send-low-balance-email";

// Margen de gracia: se permite que el saldo llegue hasta -2€ antes de
// bloquear la impresión (p. ej. un cobro de 0,10€ con saldo a 0€ no debe
// frenar un directo en marcha). Más allá de este límite, no se cobra más.
const NEGATIVE_BALANCE_FLOOR_CENTS = -200;

// No se envía un correo por cada intento bloqueado durante el mismo directo
// (podrían ser decenas) — se espacían los avisos con este margen.
const LOW_BALANCE_NOTICE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

async function notifyLowBalanceOnce(userId: string, email: string | undefined) {
  if (!email) return;
  try {
    const { data } = await supabaseAdmin
      .from("user_balances")
      .select("low_balance_notified_at")
      .eq("user_id", userId)
      .maybeSingle();

    const lastNotified = data?.low_balance_notified_at ? new Date(data.low_balance_notified_at).getTime() : 0;
    if (Date.now() - lastNotified < LOW_BALANCE_NOTICE_COOLDOWN_MS) return;

    await supabaseAdmin
      .from("user_balances")
      .update({ low_balance_notified_at: new Date().toISOString() })
      .eq("user_id", userId);

    await sendLowBalanceEmail(email);
  } catch {
    // Un fallo al avisar por email nunca debe romper la respuesta de cobro.
  }
}

type OrderRow = Record<string, unknown> & {
  id: string;
  tk: string;
  estado_impresion: string;
  fecha_impresion: string | null;
  impresiones_cobrables: number;
};

export type ChargePrintResult =
  | { status: "charged"; order: OrderRow; priceCents: number }
  | { status: "already_charged"; order: OrderRow }
  | { status: "demo"; order: OrderRow }
  | { status: "insufficient_balance" }
  | { status: "blocked"; reason: string }
  | { status: "no_owner" };

/**
 * Cobra la primera impresión de un pedido (o confirma que ya estaba cobrado,
 * en cuyo caso no vuelve a cobrar — es una reimpresión gratuita). Lógica
 * compartida entre el botón manual (app/api/orders/[id]/print) y el
 * auto-imprimir de la extensión (app/api/v1/order/detect), para que ambos
 * cobren exactamente igual y no se puedan desincronizar.
 */
export async function claimAndChargePrint(
  order: OrderRow,
  tenantId: string
): Promise<ChargePrintResult> {
  if (order.impresiones_cobrables > 0) {
    return { status: "already_charged", order };
  }

  const { data: owner } = await supabaseAdmin
    .from("users")
    .select("id, email")
    .eq("tenant_id", tenantId)
    .limit(1)
    .single();
  if (!owner) return { status: "no_owner" };

  const balance = await getUserBalance(owner.id);

  if (!balance?.is_demo) {
    if (balance?.is_blocked) {
      return { status: "blocked", reason: balance.block_reason ?? "Cuenta bloqueada para impresión." };
    }

    const priceCents = await getPriceCentsForTier(balance?.current_tier ?? 1);
    // Comprobación ANTES de reclamar el pedido: si el cobro dejaría el saldo
    // por debajo del margen de gracia (-2€), se rechaza sin marcar el pedido
    // como cobrado, para poder reintentar tras recargar en vez de quedar
    // "gratis" para siempre.
    if ((balance?.balance_cents ?? 0) - priceCents < NEGATIVE_BALANCE_FLOOR_CENTS) {
      await notifyLowBalanceOnce(owner.id, owner.email);
      return { status: "insufficient_balance" };
    }
  }

  // Reclamo atómico: solo la petición que consigue pasar impresiones_cobrables
  // de 0 a 1 procede a cobrar. Evita doble cobro por condición de carrera.
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
    // Otra petición concurrente se adelantó a cobrarlo.
    return { status: "already_charged", order };
  }

  if (balance?.is_demo) {
    return { status: "demo", order: claimed as OrderRow };
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
    tenant_id: tenantId,
    external_order_id: order.external_order_id ?? order.tk,
    tk_number: order.tk,
    price_cents: priceCents,
    order_id: order.id,
  });

  await maybeAutoRecharge(owner.id);

  return { status: "charged", order: claimed as OrderRow, priceCents };
}
