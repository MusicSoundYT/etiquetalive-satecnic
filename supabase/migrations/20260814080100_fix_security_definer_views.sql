-- Aviso de seguridad de Supabase: v_active_sessions y v_session_stats_daily
-- (sobre print_sessions/users) estaban definidas como SECURITY DEFINER —
-- se ejecutan con los permisos de quien las creó, no de quien pregunta, así
-- que se saltan cualquier RLS de las tablas de debajo. Peor aún: anon y
-- authenticated tenían permiso directo de SELECT (e incluso INSERT/UPDATE/
-- DELETE) sobre las dos — cualquiera con la clave pública podía leer datos
-- de sesiones (email de usuario, tenant_id...) de TODOS los tenants, sin
-- login. Comprobado y cerrado el 13/08 por la noche.
ALTER VIEW public.v_active_sessions SET (security_invoker = true);
ALTER VIEW public.v_session_stats_daily SET (security_invoker = true);

REVOKE ALL ON public.v_active_sessions FROM anon, authenticated;
REVOKE ALL ON public.v_session_stats_daily FROM anon, authenticated;
