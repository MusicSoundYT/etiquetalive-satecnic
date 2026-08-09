-- Encontrado en producción: la comprobación de "¿ya existe este pedido?"
-- (por external_order_id) se hacía solo en el código (SELECT y luego
-- INSERT), sin ninguna restricción real en la base de datos. Bajo una
-- carrera muy rápida (dos detecciones casi simultáneas del mismo pedido —
-- típicamente la extensión reintentando justo cuando la web de Seller se
-- recarga) las dos podían pasar la comprobación antes de que la primera
-- terminara de guardar, creando dos filas para el mismo pedido real.
--
-- Se confirmó en producción: 320 filas duplicadas de sobra en 3 tenants,
-- ninguna con impacto económico real (cuentas demo, o duplicados nunca
-- impresos/cobrados) — pero el fallo sí podía llegar a cobrar dos veces un
-- pedido real en una cuenta de pago.
--
-- NOTA: esta migración requiere que no queden filas duplicadas antes de
-- aplicarse (si no, CREATE UNIQUE INDEX falla). La limpieza de las 320
-- filas existentes se hizo aparte, a mano, antes de este script.
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_external_order_id_unique
  ON public.orders (tenant_id, external_order_id)
  WHERE external_order_id IS NOT NULL;
