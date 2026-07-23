-- /api/v1/order/detect comprueba en cada pedido detectado si ya existe uno
-- con el mismo (tenant_id, external_order_id) — esa consulta no tenía índice
-- propio (solo existía idx_orders_tenant_fecha, que no ayuda a filtrar por
-- external_order_id). Con pocos pedidos no se nota, pero es la ruta más
-- caliente de toda la extensión (se llama en cada pedido de cada directo) y
-- crecerá con el histórico acumulado del tenant a lo largo de meses.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_external_id
    ON public.orders (tenant_id, external_order_id);
