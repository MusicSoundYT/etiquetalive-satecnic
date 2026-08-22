import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCajaTikTokClient } from "@/lib/cajatiktok-export/client";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { getOrderDetails } from "@/lib/tiktok-shop/api-client";
import { businessDayRangeUtc, yesterdayMadridDate } from "@/lib/utils/madrid-date";
import { CAJATIKTOK_TENANTS, type CajaTikTokPair } from "@/lib/cajatiktok-export/tenant";

const ESTADO_ENVIO_DEFAULT = "En espera de envío";
const ORDER_DETAILS_CHUNK_SIZE = 20;
const CLIENTES_CHUNK_SIZE = 100;
// Un directo grande de verdad puede rondar o superar los 250-300 pedidos —
// se trocean también los guardados (no solo la lectura de más arriba) para
// no depender de mandar cientos de filas de golpe en una sola petición.
const UPSERT_CHUNK_SIZE = 200;

async function upsertInChunks(
  caja: ReturnType<typeof getCajaTikTokClient>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  selectCols?: string
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table_ = caja.from(table as any) as any;
    const query = table_.upsert(chunk, { onConflict });
    const { data, error } = selectCols ? await query.select(selectCols) : await query;
    if (error) throw new Error(`No se pudo guardar en "${table}": ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}

// Misma normalización que src/utils.js -> buyerKey() en el repo cajatiktok:
// hay que llegar a la MISMA clave para el mismo cliente venga de un Excel
// subido a mano o de esta exportación automática, o el historial de
// "cliente habitual" se duplicaría entre las dos fuentes.
function buyerKey(name: string): string {
  return String(name || "").trim().toLowerCase();
}

function formatFechaPedido(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

type OrderRow = {
  external_order_id: string;
  cliente: string;
  precio_cents: number;
  moneda: string;
  fecha_pedido: string;
};

async function fetchProductNames(tenantId: string, orderIds: string[]): Promise<Record<string, string>> {
  const byId: Record<string, string> = {};
  if (!orderIds.length) return byId;
  try {
    const connection = await getValidAccessToken(tenantId);
    const shops = await getShopsForConnection(connection.id);
    if (!shops.length) return byId;
    for (const shop of shops) {
      for (let i = 0; i < orderIds.length; i += ORDER_DETAILS_CHUNK_SIZE) {
        const chunk = orderIds.slice(i, i + ORDER_DETAILS_CHUNK_SIZE);
        const orders = await getOrderDetails(toApiCredentials(connection), shop.shop_cipher, chunk);
        for (const o of orders) byId[o.id] = o.line_items?.[0]?.product_name ?? "";
      }
    }
  } catch (err) {
    // El producto es informativo (Caja TikTok no lo usa para nada crítico) -
    // si TikTok falla aquí, mejor completar la importación sin él que abortar
    // toda la exportación del día.
    console.error("[Caja TikTok] No se pudieron recuperar los nombres de producto:", err);
  }
  return byId;
}

function defaultRangeNombreArchivo(startUtc: string, endUtc: string): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date(iso))
      .reduce((acc, p) => (p.type === "hour" || p.type === "minute" ? acc + p.value : acc), "");
  const [dd, mm, yyyy] = formatFechaPedido(startUtc).split(" ")[0].split("/");
  return `Importacion_Manual_${dd}-${mm}-${yyyy}_${fmt(startUtc)}-${fmt(endUtc)}.xlsx`;
}

export type DailyExportResult = {
  grupoNombre: string;
  skipped: boolean;
  date: string;
  totalOrders: number;
  totalClients: number;
  importId?: string;
  error?: string;
};

/**
 * Una pasada por CADA cliente configurado (ver tenant.ts) — si uno falla, no
 * debe frenar a los demás, cada uno tiene su propio resultado/error.
 */
export async function exportDailyAuctionOrders(dateMadrid?: string): Promise<DailyExportResult[]> {
  const date = dateMadrid ?? yesterdayMadridDate();
  // Ventana de 08:00 a 08:00 (no medianoche a medianoche): un directo que
  // empieza de noche y acaba de madrugada del día natural siguiente cae
  // entero en el mismo "día de negocio", justo antes de que el equipo entre
  // a trabajar a las 8h — ver businessDayRangeUtc.
  const { startUtc, endUtc } = businessDayRangeUtc(date);
  const [yyyy, mm, dd] = date.split("-");
  const nombreArchivo = `Auto_TikTok_${dd}-${mm}-${yyyy}.xlsx`;

  const results: DailyExportResult[] = [];
  for (const pair of CAJATIKTOK_TENANTS) {
    try {
      const result = await exportAuctionOrdersForRange(pair, startUtc, endUtc, nombreArchivo);
      results.push({ grupoNombre: pair.grupoNombre, date, ...result });
    } catch (err) {
      results.push({
        grupoNombre: pair.grupoNombre,
        date,
        skipped: false,
        totalOrders: 0,
        totalClients: 0,
        error: err instanceof Error ? err.message : "Error desconocido.",
      });
    }
  }
  return results;
}

export async function exportAuctionOrdersForRange(
  pair: CajaTikTokPair,
  startUtc: string,
  endUtc: string,
  nombreArchivo?: string
): Promise<{ skipped: boolean; totalOrders: number; totalClients: number; importId?: string }> {
  const { tenantId, grupoNombre } = pair;

  const { data: orderRows, error: ordersErr } = await supabaseAdmin
    .from("orders")
    .select("external_order_id, cliente, precio_cents, moneda, fecha_pedido")
    .eq("tenant_id", tenantId)
    .eq("raw_payload->>source", "tiktok_shop_api")
    .gte("fecha_pedido", startUtc)
    .lt("fecha_pedido", endUtc)
    .order("fecha_pedido", { ascending: true });
  if (ordersErr) throw new Error(`No se pudieron leer los pedidos de subasta del día: ${ordersErr.message}`);

  const orders = (orderRows ?? []) as OrderRow[];
  if (!orders.length) return { skipped: true, totalOrders: 0, totalClients: 0 };

  const productNameById = await fetchProductNames(
    tenantId,
    orders.map((o) => o.external_order_id)
  );

  const caja = getCajaTikTokClient();

  const { data: grupo, error: grupoErr } = await caja
    .from("grupos")
    .select("id")
    .eq("nombre", grupoNombre)
    .maybeSingle();
  if (grupoErr) throw new Error(`No se pudo buscar el grupo "${grupoNombre}" en Caja TikTok: ${grupoErr.message}`);
  if (!grupo) throw new Error(`No existe el grupo "${grupoNombre}" en Caja TikTok.`);
  const grupoId = grupo.id as string;

  const buyerKeys = [...new Set(orders.map((o) => buyerKey(o.cliente)))];
  // Trozeado: un directo entero de golpe (importación por rango) puede
  // traer cientos de clientes distintos — visto en producción, un .in() con
  // 268 nombres a la vez hace que la URL de la petición falle directamente
  // ("fetch failed", sin ni siquiera llegar a responder Supabase). Con
  // lotes pequeños no pasaba porque la exportación diaria nunca junta
  // tantos de golpe.
  const existingByKey: Record<
    string,
    { caja_preferente: number | null; ultima_caja_usada: number | null; total_importaciones: number; caja_reservada: number | null }
  > = {};
  for (let i = 0; i < buyerKeys.length; i += CLIENTES_CHUNK_SIZE) {
    const chunk = buyerKeys.slice(i, i + CLIENTES_CHUNK_SIZE);
    const { data: existingClientes, error: clientesReadErr } = await caja
      .from("clientes")
      .select("nombre_key,caja_preferente,ultima_caja_usada,total_importaciones,caja_reservada")
      .eq("grupo_id", grupoId)
      .in("nombre_key", chunk);
    if (clientesReadErr) throw new Error(`No se pudieron leer los clientes existentes: ${clientesReadErr.message}`);
    for (const row of existingClientes ?? []) existingByKey[row.nombre_key as string] = row as never;
  }

  const clientesPayload = buyerKeys.map((key) => {
    const order = orders.find((o) => buyerKey(o.cliente) === key)!;
    const existing = existingByKey[key];
    const total = (existing?.total_importaciones ?? 0) + 1;
    return {
      nombre_tiktok: order.cliente,
      nombre_key: key,
      grupo_id: grupoId,
      caja_preferente: existing?.caja_preferente ?? null,
      ultima_caja_usada: existing?.ultima_caja_usada ?? null,
      total_importaciones: total,
      es_habitual: total >= 2,
      updated_at: new Date().toISOString(),
    };
  });
  const clientesRows = await upsertInChunks(caja, "clientes", clientesPayload, "nombre_key,grupo_id", "id,nombre_key");
  const clienteIdByKey: Record<string, string> = {};
  for (const row of clientesRows) clienteIdByKey[row.nombre_key as string] = row.id as string;

  const importId = crypto.randomUUID();

  const { error: importErr } = await caja.from("importaciones").insert({
    id: importId,
    nombre_archivo: nombreArchivo ?? defaultRangeNombreArchivo(startUtc, endUtc),
    total_pedidos: orders.length,
    total_clientes: buyerKeys.length,
    activa: false,
    grupo_id: grupoId,
  });
  if (importErr) throw new Error(`No se pudo crear la importación en Caja TikTok: ${importErr.message}`);

  const asignacionesPayload = buyerKeys.map((key) => {
    const existing = existingByKey[key];
    const habitual = (existing?.total_importaciones ?? 0) > 0;
    // Si el cliente ya tenía caja reservada (le quedaban pedidos pendientes
    // de un día anterior), se le asigna directamente aquí — el gerente pidió
    // que la caja "no se finalice hasta cerrar el último pedido del
    // cliente", así que debe seguir siendo la misma aunque pasen varios días.
    const cajaReservada = existing?.caja_reservada ?? null;
    return {
      importacion_id: importId,
      cliente_id: clienteIdByKey[key],
      grupo_id: grupoId,
      numero_caja: cajaReservada,
      tipo_asignacion: habitual ? "Cliente habitual" : "Cliente nuevo",
      motivo: cajaReservada
        ? "Caja reservada de pedidos pendientes anteriores."
        : habitual
          ? "Con histórico (solo informativo). La caja se asignará al escanear su primer producto."
          : "Sin histórico. La caja se asignará al escanear su primer producto.",
      manual: false,
      preparado: false,
    };
  });
  await upsertInChunks(caja, "asignaciones_caja", asignacionesPayload, "importacion_id,cliente_id");

  const pedidosPayload = orders.map((o) => ({
    importacion_id: importId,
    cliente_id: clienteIdByKey[buyerKey(o.cliente)],
    grupo_id: grupoId,
    pedido_tiktok: o.external_order_id,
    importe: o.precio_cents / 100,
    importe_texto: (o.precio_cents / 100).toFixed(2),
    caja_asignada: existingByKey[buyerKey(o.cliente)]?.caja_reservada ?? null,
    escaneado: false,
    fecha_escaneo: null,
    estado: "pendiente",
    estado_envio: ESTADO_ENVIO_DEFAULT,
    fecha_pedido: formatFechaPedido(o.fecha_pedido),
    marcado: false,
    producto: productNameById[o.external_order_id] || null,
  }));
  await upsertInChunks(caja, "pedidos", pedidosPayload, "importacion_id,pedido_tiktok");

  return { skipped: false, totalOrders: orders.length, totalClients: buyerKeys.length, importId };
}
