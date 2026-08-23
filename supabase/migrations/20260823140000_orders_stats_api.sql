-- Mismo resumen que get_orders_stats, pero solo de los pedidos detectados
-- por la API de TikTok Shop (raw_payload->>'source' = 'tiktok_shop_api') —
-- para las tarjetas de estadísticas de "Pedidos (API)", que hasta ahora no
-- mostraba ninguna, a diferencia del Dashboard normal.
CREATE OR REPLACE FUNCTION public.get_orders_stats_api(p_tenant_id uuid)
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
  WHERE tenant_id = p_tenant_id
    AND raw_payload->>'source' = 'tiktok_shop_api';
$$;
