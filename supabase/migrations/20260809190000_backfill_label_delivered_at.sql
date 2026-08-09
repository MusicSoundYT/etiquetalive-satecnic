-- Fallo urgente en producción: label_delivered_at se añadió esta semana sin
-- rellenar para los pedidos ya existentes. /api/tiktok/pending-print
-- considera "pendiente de imprimir" cualquier pedido cobrado
-- (impresiones_cobrables > 0) con label_delivered_at IS NULL — eso incluía
-- TODO el histórico ya impreso hace semanas vía la extensión (miles de
-- pedidos), y la pestaña de "Pedidos (API)" los iba reimprimiendo 5 en 5
-- cada 5 segundos sin parar, bloqueando la página con diálogos de impresión
-- en bucle.
--
-- Se rellena con fecha_impresion (o, si faltara, fecha_detectado) para todo
-- lo que ya estaba cobrado antes de que existiera esta columna, así deja de
-- verse como pendiente.
UPDATE public.orders
SET label_delivered_at = COALESCE(fecha_impresion, fecha_detectado)
WHERE impresiones_cobrables > 0
  AND label_delivered_at IS NULL;
