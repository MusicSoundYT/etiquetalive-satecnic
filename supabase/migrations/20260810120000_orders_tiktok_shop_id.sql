-- Un mismo tenant puede tener varias tiendas de TikTok conectadas (varias
-- trabajadoras, cada una con su propia tienda) — hasta ahora no se guardaba
-- de qué tienda venía cada pedido, así que "Pedidos (API)" y el aviso
-- automático no podían distinguir unas de otras: cualquier pestaña abierta
-- con la misma cuenta de EtiquetaLive imprimía los pedidos de TODAS las
-- tiendas, no solo la suya.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS tiktok_shop_id text;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_tiktok_shop
    ON public.orders (tenant_id, tiktok_shop_id);
