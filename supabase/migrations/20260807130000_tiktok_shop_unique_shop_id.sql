-- Visto en producción: la misma tienda real de TikTok se autorizó dos veces
-- desde dos cuentas de EtiquetaLive distintas, creando dos conexiones para el
-- mismo shop_id — eso rompía la búsqueda del webhook (que asume un shop_id
-- solo puede pertenecer a un tenant). Se añade una restricción única a nivel
-- de base de datos para que esto falle alto y claro la próxima vez, en vez
-- de colarse en silencio.
ALTER TABLE public.tiktok_shop_shops
    ADD CONSTRAINT tiktok_shop_shops_shop_id_unique UNIQUE (shop_id);
