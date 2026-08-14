-- Sin este índice, la comprobación de duplicado de /api/auction/event
-- (WHERE tenant_id = ... AND signature = ... ORDER BY detected_at DESC
-- LIMIT 1) no tenía ningún índice que cubriera exactamente esa combinación
-- — los dos índices existentes son (session_id, signature, detected_at) y
-- (tenant_id, detected_at), ninguno sirve para filtrar por (tenant_id,
-- signature) a la vez. Según auction_events_v2 crecía durante un directo,
-- esa consulta se volvía cada vez más lenta (se vio en producción tardar
-- más de 30s), contribuyendo a una caída real del 13 de agosto (ver
-- incidencia de Supabase, proyecto en t4g.nano bajo presión de memoria).
--
-- NOTA: la primera vez que se creó este índice (en caliente, durante la
-- incidencia), un corte de conexión de Supabase lo dejó a medias
-- (INVALID) — CREATE INDEX CONCURRENTLY no reintenta solo. Se detectó y
-- se recreó limpio al día siguiente, con la base de datos ya estable.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auction_events_v2_tenant_signature
  ON public.auction_events_v2 (tenant_id, signature, detected_at DESC);
