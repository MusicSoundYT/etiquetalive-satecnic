import "server-only";

/**
 * Datos de ejemplo (nunca de la base de datos) usados tanto en la vista
 * previa en pantalla como en "Imprimir etiqueta de prueba", para que
 * ambos muestren siempre lo mismo. La fecha es siempre la actual en el
 * momento de generar la etiqueta.
 */
export function buildTestSampleOrder() {
  return {
    tk: "PRUEBA",
    external_order_id: "000000000000",
    cliente: "WooW Insolito",
    precio_cents: 999,
    moneda: "EUR",
    fecha_pedido: new Date().toISOString(),
    raw_payload: { tiktok_name: "WoowInsolito" },
  };
}
