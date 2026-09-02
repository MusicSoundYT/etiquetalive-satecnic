import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Margen a cada lado de la fecha del pedido en el que se buscan ganadores de
// subasta con el mismo precio — el pedido tarda algo en crearse tras
// terminar la ronda (visto en producción: normalmente segundos, alguna vez
// algo más), y el reloj de cada ordenador puede ir ligeramente desajustado.
const PRICE_MATCH_WINDOW_MS = 2 * 60 * 1000;
// Los importes vienen de convertir texto a número en dos sitios distintos
// (la extensión y la API) — un céntimo de margen absorbe redondeos sin
// abrir la puerta a precios de verdad distintos.
const PRICE_MATCH_TOLERANCE_CENTS = 1;

/**
 * Si, en la ventana de tiempo alrededor de este pedido, UNA SOLA estación
 * ganó una subasta al mismo precio, se devuelve su device_id — ese pedido es
 * claramente suyo, no hace falta repartirlo a nadie más. Si hay cero
 * coincidencias, o dos o más estaciones distintas coinciden en el mismo
 * precio a la vez (raro, pero posible con precios redondos habituales), se
 * devuelve null: no hay forma fiable de saber de quién es.
 *
 * Compartida entre los dos caminos que pueden entregar/imprimir un pedido:
 * el sondeo de Pedidos (API) (pending-print, reparte una etiqueta ya
 * cobrada a un dispositivo) y la auto-detección de la extensión en Seller
 * Center (order/detect, decide si ESTE dispositivo debe cobrar e imprimir
 * el pedido que acaba de detectar) — para que las dos vías apliquen
 * exactamente el mismo criterio.
 */
export async function resolveExclusiveDevice(
  tenantId: string,
  subtotalCents: number | null | undefined,
  fechaDetectado: string
): Promise<string | null> {
  if (subtotalCents == null) return null;
  const center = new Date(fechaDetectado).getTime();
  const since = new Date(center - PRICE_MATCH_WINDOW_MS).toISOString();
  const until = new Date(center + PRICE_MATCH_WINDOW_MS).toISOString();
  const priceLow = (subtotalCents - PRICE_MATCH_TOLERANCE_CENTS) / 100;
  const priceHigh = (subtotalCents + PRICE_MATCH_TOLERANCE_CENTS) / 100;

  const { data: events } = await supabaseAdmin
    .from("auction_events_v2")
    .select("station_id")
    .eq("tenant_id", tenantId)
    .not("station_id", "is", null)
    .gte("price_value", priceLow)
    .lte("price_value", priceHigh)
    .gte("detected_at", since)
    .lte("detected_at", until);

  const distinctDevices = new Set((events ?? []).map((e) => e.station_id as string));
  return distinctDevices.size === 1 ? [...distinctDevices][0] : null;
}
