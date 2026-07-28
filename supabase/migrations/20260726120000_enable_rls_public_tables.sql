-- Aviso de seguridad de Supabase (26/07/2026): estas tablas tenían Row-Level
-- Security desactivado, lo que las hacía accesibles directamente vía la API
-- REST pública de Supabase (con la clave publishable, extraíble del propio
-- sitio) a cualquiera, sin pasar por la aplicación — lectura, escritura y
-- borrado completos.
--
-- Toda la app accede a Supabase exclusivamente desde el servidor con la
-- clave de rol de servicio (lib/supabase-admin.ts, "server-only"), que
-- ignora RLS pase lo que pase. La clave publishable no se usa en ningún
-- sitio del código. Por eso activar RLS aquí, sin añadir ninguna política,
-- es seguro: el servidor sigue funcionando exactamente igual, y el acceso
-- público directo (que no tenía ninguna política que lo permitiera) queda
-- bloqueado en vez de abierto por defecto.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_scan_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tk_counters ENABLE ROW LEVEL SECURITY;
