import "server-only";
import { getCajaTikTokClient } from "@/lib/cajatiktok-export/client";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { getOrderDetails } from "@/lib/tiktok-shop/api-client";
import { mapTikTokStatusToEstadoEnvio } from "@/lib/cajatiktok-export/status-mapping";
import { CAJATIKTOK_TENANTS, type CajaTikTokPair } from "@/lib/cajatiktok-export/tenant";

const ORDER_DETAILS_CHUNK_SIZE = 20;
const LOOKBACK_DAYS = 10;
// Estados terminales: una vez aquí, el pedido ya no cambia en TikTok, así
// que dejar de revisarlo evita que la lista de "pendientes de comprobar"
// crezca sin límite con el paso de los días.
const ESTADOS_TERMINALES = ["Cancelado", "Entregado"];

export type RefreshResult = { grupoNombre: string; checked: number; updated: number; error?: string };

/** Una pasada por cada cliente configurado — si uno falla, no frena a los demás. */
export async function refreshCajaTikTokOrderStatus(): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  for (const pair of CAJATIKTOK_TENANTS) {
    try {
      const { checked, updated } = await refreshOneClient(pair);
      results.push({ grupoNombre: pair.grupoNombre, checked, updated });
    } catch (err) {
      results.push({
        grupoNombre: pair.grupoNombre,
        checked: 0,
        updated: 0,
        error: err instanceof Error ? err.message : "Error desconocido.",
      });
    }
  }
  return results;
}

async function refreshOneClient(pair: CajaTikTokPair): Promise<{ checked: number; updated: number }> {
  const { tenantId, grupoNombre } = pair;
  const caja = getCajaTikTokClient();

  const { data: grupo, error: grupoErr } = await caja
    .from("grupos")
    .select("id")
    .eq("nombre", grupoNombre)
    .maybeSingle();
  if (grupoErr) throw new Error(`No se pudo buscar el grupo "${grupoNombre}" en Caja TikTok: ${grupoErr.message}`);
  if (!grupo) throw new Error(`No existe el grupo "${grupoNombre}" en Caja TikTok.`);
  const grupoId = grupo.id as string;

  const lookbackIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60_000).toISOString();
  // Solo importaciones generadas por nuestra propia exportación (diaria o por
  // rango) — NUNCA las subidas manuales de Excel del equipo (incluidos los
  // volcados "Todo pedido..." con miles de pedidos que no son de subasta),
  // que no nos corresponde tocar.
  const { data: recentImports, error: importsErr } = await caja
    .from("importaciones")
    .select("id")
    .eq("grupo_id", grupoId)
    .neq("estado", "eliminado")
    .gte("fecha_subida", lookbackIso)
    .or("nombre_archivo.ilike.Auto_TikTok_%,nombre_archivo.ilike.Importacion_Manual_%");
  if (importsErr) throw new Error(`No se pudieron leer las importaciones recientes: ${importsErr.message}`);
  const importIds = (recentImports ?? []).map((r) => r.id as string);
  if (!importIds.length) return { checked: 0, updated: 0 };

  // Sin .range(), PostgREST recorta en silencio a 1000 filas — con el
  // filtro de arriba el volumen real es pequeño, pero se pagina de todos
  // modos para no volver a depender de ese límite implícito.
  const PAGE_SIZE = 1000;
  const rows: { id: string; pedido_tiktok: string; estado_envio: string | null }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error: pedidosErr } = await caja
      .from("pedidos")
      .select("id,pedido_tiktok,estado_envio")
      .in("importacion_id", importIds)
      .not("estado_envio", "in", `(${ESTADOS_TERMINALES.join(",")})`)
      .range(from, from + PAGE_SIZE - 1);
    if (pedidosErr) throw new Error(`No se pudieron leer los pedidos a comprobar: ${pedidosErr.message}`);
    rows.push(...((page ?? []) as typeof rows));
    if (!page || page.length < PAGE_SIZE) break;
  }
  if (!rows.length) return { checked: 0, updated: 0 };

  const connection = await getValidAccessToken(tenantId);
  const shops = await getShopsForConnection(connection.id);
  if (!shops.length) throw new Error("No hay ninguna tienda de TikTok Shop conectada.");

  const estadoByOrderId: Record<string, string> = {};
  for (const shop of shops) {
    // Un mismo pedido puede aparecer varias veces en `rows` (imports de Caja
    // TikTok que se solapan en fechas) — sin deduplicar, un lote podía llevar
    // el mismo order_id repetido, y TikTok rechaza la llamada entera con
    // "exist wrong order_id" (visto en producción, el mismo lote fallando en
    // cada ejecución del cron sin avanzar nunca).
    const orderIds = [...new Set(rows.map((r) => r.pedido_tiktok))];
    for (let i = 0; i < orderIds.length; i += ORDER_DETAILS_CHUNK_SIZE) {
      const chunk = orderIds.slice(i, i + ORDER_DETAILS_CHUNK_SIZE);
      try {
        const orders = await getOrderDetails(toApiCredentials(connection), shop.shop_cipher, chunk);
        for (const o of orders) estadoByOrderId[o.id] = mapTikTokStatusToEstadoEnvio(o.status);
      } catch (err) {
        // Visto en producción: un solo pedido_tiktok inválido tira abajo el
        // lote entero de 20 ("exist wrong order_id") — y sin más, ESE mismo
        // lote se queda atascado para siempre: en cada pasada del cron vuelve
        // a fallar por el mismo id inválido, así que los otros ~19 pedidos
        // válidos del lote nunca llegan a actualizar su estado (confirmado:
        // TikTok combina automáticamente varios pedidos de un mismo
        // comprador en un solo envío antes de despacharlos, y el id del
        // pedido absorbido deja de ser válido para esta API — no es un error
        // nuestro ni algo puntual, va a seguir pasando). En vez de descartar
        // el lote entero, se reintenta pedido a pedido: así solo se pierde el
        // (o los) id realmente inválido y el resto sigue actualizándose.
        console.error(`[Caja TikTok] Lote de estados fallido (${chunk.join(", ")}), reintentando uno a uno:`, err);
        for (const oneId of chunk) {
          try {
            const [order] = await getOrderDetails(toApiCredentials(connection), shop.shop_cipher, [oneId]);
            if (order) estadoByOrderId[order.id] = mapTikTokStatusToEstadoEnvio(order.status);
          } catch (oneErr) {
            console.error(`[Caja TikTok] Pedido con id inválido para TikTok (probablemente combinado con otro): ${oneId}`, oneErr);
          }
        }
      }
    }
  }

  let updated = 0;
  for (const row of rows) {
    const nuevoEstado = estadoByOrderId[row.pedido_tiktok];
    if (!nuevoEstado || nuevoEstado === row.estado_envio) continue;
    const { error: updateErr } = await caja.from("pedidos").update({ estado_envio: nuevoEstado }).eq("id", row.id);
    if (updateErr) {
      console.error(`[Caja TikTok] No se pudo actualizar el estado del pedido ${row.pedido_tiktok}:`, updateErr.message);
      continue;
    }
    updated++;
  }

  return { checked: rows.length, updated };
}
