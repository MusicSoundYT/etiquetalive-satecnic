import "server-only";

// Traduce el estado real de TikTok al pequeño conjunto de estados que
// entiende Caja TikTok (src/state.js -> ESTADOS_ENVIO en el repo cajatiktok).
// Debe quedar en sincronía manual con esa lista si algún día cambia allí.
export function mapTikTokStatusToEstadoEnvio(status: string): string {
  switch (status) {
    case "CANCELLED":
      return "Cancelado";
    case "AWAITING_COLLECTION":
      return "Espera recogida";
    case "IN_TRANSIT":
    case "PARTIALLY_SHIPPING":
      return "En tránsito";
    case "DELIVERED":
    case "COMPLETED":
      return "Entregado";
    case "UNPAID":
    case "ON_HOLD":
    case "AWAITING_SHIPMENT":
    default:
      return "En espera de envío";
  }
}
