import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Al superar este número de etiquetas cobradas en el mes en curso, el
// cliente sube de rango automáticamente (nunca baja solo). Las cuentas DEMO
// no pasan por esta comprobación: charge-print.ts corta antes para ellas.
const TIER_UPGRADE_THRESHOLDS: Record<number, number> = {
  1: 1500, // Rango 1 -> Rango 2
  2: 3000, // Rango 2 -> Rango 3
  // Rango 3 no tiene umbral: es el máximo.
};

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Tras cobrar una etiqueta, comprueba si el cliente ha superado el umbral de
 * su rango actual dentro del mes en curso y, si es así, lo sube al
 * siguiente. Se llama solo desde claimAndChargePrint, que ya excluye a las
 * cuentas DEMO antes de llegar aquí.
 */
export async function maybeAutoUpgradeTier(tenantId: string, userId: string, currentTier: number): Promise<void> {
  const threshold = TIER_UPGRADE_THRESHOLDS[currentTier];
  if (!threshold) return; // ya está en el rango máximo, o el rango no está contemplado

  const { start, end } = currentMonthRange();
  const { count } = await supabaseAdmin
    .from("orders_processed")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("processed_at", start)
    .lt("processed_at", end);

  if ((count ?? 0) < threshold) return;

  // Condicionado a que siga en el mismo rango que teníamos leído, para no
  // pisar un cambio manual de un administrador que haya ocurrido justo en
  // medio (p. ej. si ya lo subieron a mano a un rango superior).
  await supabaseAdmin
    .from("user_balances")
    .update({ current_tier: currentTier + 1 })
    .eq("user_id", userId)
    .eq("current_tier", currentTier);
}
