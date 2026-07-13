-- Resumen de pedidos por tenant para las tarjetas de estadísticas del
-- dashboard (equivalente a calcStatsFromOrders() del legacy).
CREATE OR REPLACE FUNCTION public.get_orders_stats(p_tenant_id uuid)
RETURNS TABLE(total integer, impresos integer, pendientes integer, reimpresiones bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE impresiones_cobrables > 0)::int AS impresos,
    count(*) FILTER (WHERE impresiones_cobrables = 0)::int AS pendientes,
    coalesce(sum(reimpresiones), 0)::bigint AS reimpresiones
  FROM public.orders
  WHERE tenant_id = p_tenant_id;
$$;
