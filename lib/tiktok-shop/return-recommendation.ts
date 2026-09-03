import "server-only";
import { searchOrders, getOrderDetails, type TikTokApiCredentials } from "@/lib/tiktok-shop/api-client";

export type ReturnRecommendation = {
  decision: "approve" | "reject" | "manual";
  reason: string;
  // El user_id del comprador en TikTok, cuando se ha llegado a consultar el
  // pedido — lo usa el panel para registrar la decisión en devoluciones_decisiones
  // (lista negra informativa de compradores con más de 3 cancelaciones
  // aprobadas). No siempre está disponible (p.ej. si el pedido no se pudo
  // consultar).
  buyerUserId?: string;
};

/**
 * Calcula qué haría la regla acordada con el cliente para una cancelación
 * (return_type "REFUND") — NUNCA ejecuta nada, solo lo sugiere para que el
 * panel lo muestre. La regla: si TikTok combinó varios pedidos del mismo
 * comprador en un solo envío (mismo auto_combine_group_id), solo el más
 * antiguo de ese grupo lleva los gastos de envío de todos —
 *
 *   - 1 o 2 pedidos en el grupo → aprobar.
 *   - 3+ pedidos, y es el más antiguo del grupo → rechazar (perdería el
 *     envío que cubre a los demás).
 *   - 3+ pedidos, y no es el más antiguo → aprobar.
 *
 * Confirmado en producción: searchOrders con buyer_user_id sí filtra de
 * verdad, y cada pedido que devuelve ya trae su propio
 * auto_combine_group_id (no hace falta pedir el detalle de cada uno).
 */
export async function computeReturnRecommendation(
  credentials: TikTokApiCredentials,
  shopCipher: string,
  orderId: string
): Promise<ReturnRecommendation> {
  const [order] = await getOrderDetails(credentials, shopCipher, [orderId]);
  if (!order) return { decision: "manual", reason: "No se ha podido consultar este pedido en TikTok." };
  if (!order.auto_combine_group_id || !order.user_id) {
    return {
      decision: "manual",
      reason: "Este pedido no tiene grupo de envío combinado — revisar a mano.",
      buyerUserId: order.user_id,
    };
  }

  const { orders } = await searchOrders(credentials, shopCipher, {
    buyerUserId: order.user_id,
    pageSize: 50,
    sortField: "create_time",
    sortOrder: "ASC",
  });
  let group = orders.filter((o) => o.auto_combine_group_id === order.auto_combine_group_id);
  // Red de seguridad: un pedido recién creado podría no aparecer todavía en
  // la búsqueda — si no se encuentra ninguno, se trata como grupo de 1 (el
  // propio pedido) en vez de fallar.
  if (!group.some((o) => o.id === orderId)) group = [...group, order];
  const sorted = [...group].sort((a, b) => a.create_time - b.create_time);
  const size = sorted.length;
  const position = sorted.findIndex((o) => o.id === orderId) + 1;

  if (size <= 2) {
    return {
      decision: "approve",
      reason: `El comprador tiene ${size} pedido${size === 1 ? "" : "s"} en este envío combinado.`,
      buyerUserId: order.user_id,
    };
  }
  if (position === 1) {
    return {
      decision: "reject",
      reason: `Es el 1º de ${size} pedidos del mismo envío combinado — lleva los gastos de envío de todo el grupo.`,
      buyerUserId: order.user_id,
    };
  }
  return {
    decision: "approve",
    reason: `Es el ${position}º de ${size} pedidos del mismo envío combinado — no lleva los gastos de envío.`,
    buyerUserId: order.user_id,
  };
}
