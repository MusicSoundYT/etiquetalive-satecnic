import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { madridDayRangeUtc, yesterdayMadridDate } from "@/lib/utils/madrid-date";

export type DailyPrintSummaryRow = { tenantName: string; count: number };

/**
 * Cuenta, por cada cliente de EtiquetaLive (tenant), cuántas etiquetas se
 * imprimieron POR PRIMERA VEZ (fecha_impresion) durante el día natural
 * indicado (Europe/Madrid). Las reimpresiones no se cuentan aparte: solo se
 * guarda un contador acumulado por pedido (orders.reimpresiones), sin fecha
 * propia de cada reimpresión, así que no se puede saber cuántas de ellas
 * cayeron justo ayer.
 */
export async function getDailyPrintSummary(
  dateMadrid?: string
): Promise<{ date: string; rows: DailyPrintSummaryRow[]; total: number }> {
  const date = dateMadrid ?? yesterdayMadridDate();
  const { startUtc, endUtc } = madridDayRangeUtc(date);

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("tenant_id, tenants(business_name)")
    .gte("fecha_impresion", startUtc)
    .lt("fecha_impresion", endUtc);
  if (error) throw new Error(`No se pudo leer el resumen de impresiones: ${error.message}`);

  const countByTenant = new Map<string, { name: string; count: number }>();
  for (const row of (data ?? []) as { tenant_id: string; tenants: { business_name: string }[] | { business_name: string } | null }[]) {
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    const name = tenant?.business_name ?? row.tenant_id;
    const entry = countByTenant.get(row.tenant_id);
    if (entry) entry.count++;
    else countByTenant.set(row.tenant_id, { name, count: 1 });
  }

  const rows = [...countByTenant.values()]
    .map((v) => ({ tenantName: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return { date, rows, total };
}
