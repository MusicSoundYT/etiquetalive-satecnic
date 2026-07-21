-- Registro en bruto de cada barrido que la extensión hace de la página de
-- pedidos de Seller, antes de intentar parsear pedidos concretos (eso va por
-- /api/v1/order/detect). Hasta ahora /api/orders/scan recibía estos datos y
-- los descartaba sin guardar nada — cada vez que hacía falta ver qué había
-- detectado realmente la extensión en un incidente en directo, había que
-- parar el directo para añadir console.log y reinstalar. Con esto se puede
-- consultar directamente en la base de datos.
create table if not exists order_scan_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  captured_at timestamptz not null default now(),
  reason text,
  href text,
  card_count integer not null default 0,
  cards jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_scan_log_tenant_captured_idx
  on order_scan_log (tenant_id, captured_at desc);

-- No hace falta guardar esto para siempre: es un log de diagnóstico de corta
-- vida, no un dato de negocio. Se deja sin política de borrado automático por
-- ahora (limpieza manual si crece demasiado).
