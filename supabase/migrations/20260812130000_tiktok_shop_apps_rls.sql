-- tiktok_shop_apps guarda app_key/app_secret de TikTok Shop por tenant —
-- igual que el resto de tablas nuevas de este proyecto (ver
-- 20260726120000_enable_rls_public_tables.sql), se activa RLS sin ninguna
-- política: el servidor sigue accediendo igual con la clave de rol de
-- servicio (que ignora RLS), y el acceso público directo queda bloqueado
-- en vez de abierto por defecto. Se le había pasado por alto en la
-- migración que creó la tabla.
ALTER TABLE public.tiktok_shop_apps ENABLE ROW LEVEL SECURITY;
