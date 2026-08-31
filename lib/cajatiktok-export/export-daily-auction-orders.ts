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
  raw_payload: { user_id?: string | null } | null;
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

type HistoricalScan = { fecha_escaneo: string | null };

/**
 * Busca si alguno de estos pedidos ya se escaneó en OTRA importación (de
 * cualquier origen: la web de Caja TikTok, la automática diaria, u otra
 * importación por rango), para no obligar a re-escanear algo ya hecho.
 * Mismo criterio que findHistoricalScannedStatus() en excel.js del repo de
 * Caja TikTok: cualquier importación no borrada (estado != "eliminado"), se
 * queda con el escaneo más reciente si hay más de uno.
 */
async function fetchHistoricalScannedStatus(
  caja: ReturnType<typeof getCajaTikTokClient>,
  grupoId: string,
  orderIds: string[]
): Promise<Record<string, HistoricalScan>> {
  const byOrderId: Record<string, HistoricalScan> = {};
  if (!orderIds.length) return byOrderId;

  const { data: trashed, error: trashErr } = await caja
    .from("importaciones")
    .select("id")
    .eq("grupo_id", grupoId)
    .eq("estado", "eliminado");
  if (trashErr) throw new Error(`No se pudieron leer las importaciones en papelera: ${trashErr.message}`);
  const trashedIds = new Set((trashed ?? []).map((r) => r.id as string));

  for (let i = 0; i < orderIds.length; i += ORDER_DETAILS_CHUNK_SIZE) {
    const chunk = orderIds.slice(i, i + ORDER_DETAILS_CHUNK_SIZE);
    const { data, error } = await caja
      .from("pedidos")
      .select("pedido_tiktok,fecha_escaneo,importacion_id")
      .eq("grupo_id", grupoId)
      .in("pedido_tiktok", chunk)
      .eq("escaneado", true);
    if (error) throw new Error(`No se pudo consultar el historial de pedidos escaneados: ${error.message}`);
    for (const row of data ?? []) {
      if (trashedIds.has(row.importacion_id as string)) continue;
      const prev = byOrderId[row.pedido_tiktok as string];
      if (!prev || new Date((row.fecha_escaneo as string) || 0) > new Date(prev.fecha_escaneo || 0)) {
        byOrderId[row.pedido_tiktok as string] = { fecha_escaneo: row.fecha_escaneo as string | null };
      }
    }
  }
  return byOrderId;
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

  const caja = getCajaTikTokClient();

  const results: DailyExportResult[] = [];
  for (const pair of CAJATIKTOK_TENANTS) {
    try {
      // El grupo puede haber desactivado la importación automática (Menú →
      // interruptor "Importación automática del día anterior" en Caja
      // TikTok, solo admin) — por ejemplo, un cliente que no hace directo
      // todos los días y no quiere una importación vacía cada mañana. Se
      // trata como "sin nada que exportar" si está desactivada, no como un
      // error.
      const { data: grupo } = await caja
        .from("grupos")
        .select("importacion_automatica_habilitada")
        .eq("nombre", pair.grupoNombre)
        .maybeSingle();
      if (grupo?.importacion_automatica_habilitada === false) {
        results.push({ grupoNombre: pair.grupoNombre, date, skipped: true, totalOrders: 0, totalClients: 0 });
        continue;
      }

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

/**
 * Solo lectura: los pedidos de subasta de este tenant en el rango dado, tal
 * cual están en nuestra tabla "orders" — sin tocar la base de datos de Caja
 * TikTok. Lo usan tanto exportAuctionOrdersForRange (que además ESCRIBE una
 * importación nueva) como el endpoint de solo lectura fetch-range-orders
 * (que la Edge Function "Actualizar por API" de Caja TikTok usa para
 * fusionar pedidos nuevos con la importación YA activa, en vez de crear una
 * importación aparte).
 */
export async function fetchAuctionOrdersForRange(
  pair: CajaTikTokPair,
  startUtc: string,
  endUtc: string
): Promise<{ orders: (OrderRow & { productName: string; userId: string | null })[] }> {
  const { tenantId } = pair;

  const { data: orderRows, error: ordersErr } = await supabaseAdmin
    .from("orders")
    .select("external_order_id, cliente, precio_cents, moneda, fecha_pedido, raw_payload")
    .eq("tenant_id", tenantId)
    .eq("raw_payload->>source", "tiktok_shop_api")
    .gte("fecha_pedido", startUtc)
    .lt("fecha_pedido", endUtc)
    .order("fecha_pedido", { ascending: true });
  if (ordersErr) throw new Error(`No se pudieron leer los pedidos de subasta del rango: ${ordersErr.message}`);

  const orders = (orderRows ?? []) as OrderRow[];
  if (!orders.length) return { orders: [] };

  const productNameById = await fetchProductNames(
    tenantId,
    orders.map((o) => o.external_order_id)
  );

  // user_id: identificador interno de TikTok para el comprador, nunca
  // enmascarado (a diferencia de "cliente") — Caja TikTok lo usa para
  // reconocer a un cliente ya conocido aunque su nombre venga tapado en
  // esta actualización. Puede faltar en pedidos guardados antes de que se
  // empezara a capturar.
  const mapped = orders.map((o) => ({
    ...o,
    productName: productNameById[o.external_order_id] ?? "",
    userId: o.raw_payload?.user_id ?? null,
  }));

  // Dentro de UN MISMO lote, dos pedidos del mismo user_id pueden traer el
  // nombre del comprador enmascarado en uno y completo en otro (comprobado
  // en producción: mismo user_id, un pedido con "V***or M***id L***z" y
  // otro con el nombre real) — sin esto, tanto "Importar sesión de TikTok"
  // como la exportación automática diaria (que agrupan clientes por
  // nombre, ver exportAuctionOrdersForRange) crearían dos clientes/cajas
  // distintos para la misma persona dentro de la misma importación. Se
  // homogeniza aquí: para cada user_id del lote se usa, en todos sus
  // pedidos, el nombre menos enmascarado que se haya visto — así lo
  // reciben ya corregido tanto esas dos vías como "Actualizar por API".
  const looksMasked = (name: string) => name.includes("*");
  const bestNameByUserId = new Map<string, string>();
  for (const o of mapped) {
    if (!o.userId) continue;
    const current = bestNameByUserId.get(o.userId);
    if (!current || (looksMasked(current) && !looksMasked(o.cliente))) bestNameByUserId.set(o.userId, o.cliente);
  }
  for (const o of mapped) {
    if (o.userId && bestNameByUserId.has(o.userId)) o.cliente = bestNameByUserId.get(o.userId)!;
  }

  return { orders: mapped };
}

export async function exportAuctionOrdersForRange(
  pair: CajaTikTokPair,
  startUtc: string,
  endUtc: string,
  nombreArchivo?: string,
  // Solo lo pasa a true /api/cajatiktok/import-range (el botón manual
  // "Importar sesión de TikTok" de Caja TikTok) — la exportación
  // automática diaria (exportDailyAuctionOrders) sigue dejando la
  // importación inactiva por defecto, a la espera de que alguien la revise
  // y la marque a mano, tal como se decidió para esa vía.
  activarComoActiva = false
): Promise<{ skipped: boolean; totalOrders: number; totalClients: number; importId?: string }> {
  const { grupoNombre } = pair;

  const { orders: fetchedOrders } = await fetchAuctionOrdersForRange(pair, startUtc, endUtc);
  if (!fetchedOrders.length) return { skipped: true, totalOrders: 0, totalClients: 0 };
  const orders: OrderRow[] = fetchedOrders;
  const productNameById: Record<string, string> = {};
  for (const o of fetchedOrders) productNameById[o.external_order_id] = o.productName;

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
    activa: activarComoActiva,
    grupo_id: grupoId,
  });
  if (importErr) throw new Error(`No se pudo crear la importación en Caja TikTok: ${importErr.message}`);

  if (activarComoActiva) {
    // Mismo mecanismo que saveImportToSupabase() en el repo de Caja TikTok
    // al confirmar la subida de un Excel: solo puede haber una importación
    // activa por grupo a la vez.
    const { error: deactivateErr } = await caja
      .from("importaciones")
      .update({ activa: false })
      .eq("activa", true)
      .eq("grupo_id", grupoId)
      .neq("id", importId);
    if (deactivateErr) throw new Error(`No se pudieron desactivar las importaciones anteriores: ${deactivateErr.message}`);
  }

  // Dos clientes distintos no pueden compartir número de caja dentro de la
  // misma importación (restricción añadida en Caja TikTok tras verlo en
  // producción: la caja reservada de un cliente coincidía por error con la
  // que ya usaba otro cliente nuevo del mismo import, lo que además rompería
  // ahora todo el lote al chocar con esa restricción). Se lleva la cuenta de
  // qué números de caja reservada ya se han usado en ESTE mismo lote — el
  // primero que llega se la queda, al resto se les trata como cliente nuevo
  // (caja en blanco, se le asignará una libre al escanear su primer producto).
  const cajasReservadasUsadas = new Set<number>();
  const asignacionesPayload = buyerKeys.map((key) => {
    const existing = existingByKey[key];
    const habitual = (existing?.total_importaciones ?? 0) > 0;
    // Si el cliente ya tenía caja reservada (le quedaban pedidos pendientes
    // de un día anterior), se le asigna directamente aquí — el gerente pidió
    // que la caja "no se finalice hasta cerrar el último pedido del
    // cliente", así que debe seguir siendo la misma aunque pasen varios días.
    let cajaReservada = existing?.caja_reservada ?? null;
    if (cajaReservada != null) {
      if (cajasReservadasUsadas.has(cajaReservada)) cajaReservada = null;
      else cajasReservadasUsadas.add(cajaReservada);
    }
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

  // Un mismo pedido puede ya estar escaneado en OTRA importación (la
  // automática de este mismo día, o una anterior) antes de que se cree esta
  // — visto en producción: cada "Importar sesión de TikTok" por rango
  // creaba el pedido con escaneado=false sin comprobar nada, obligando al
  // almacén a volver a escanear algo que ya tenían hecho. Mismo mecanismo
  // que findHistoricalScannedStatus() en el repo de Caja TikTok (excel.js),
  // para que dé igual por qué camino se cree la importación.
  const orderIds = orders.map((o) => o.external_order_id);
  const historicalByOrderId = await fetchHistoricalScannedStatus(caja, grupoId, orderIds);

  const pedidosPayload = orders.map((o) => {
    const hist = historicalByOrderId[o.external_order_id];
    return {
      importacion_id: importId,
      cliente_id: clienteIdByKey[buyerKey(o.cliente)],
      grupo_id: grupoId,
      pedido_tiktok: o.external_order_id,
      importe: o.precio_cents / 100,
      importe_texto: (o.precio_cents / 100).toFixed(2),
      caja_asignada: existingByKey[buyerKey(o.cliente)]?.caja_reservada ?? null,
      escaneado: !!hist,
      fecha_escaneo: hist?.fecha_escaneo ?? null,
      estado: hist ? "escaneado" : "pendiente",
      estado_envio: ESTADO_ENVIO_DEFAULT,
      fecha_pedido: formatFechaPedido(o.fecha_pedido),
      marcado: false,
      producto: productNameById[o.external_order_id] || null,
    };
  });
  await upsertInChunks(caja, "pedidos", pedidosPayload, "importacion_id,pedido_tiktok");

  return { skipped: false, totalOrders: orders.length, totalClients: buyerKeys.length, importId };
}
