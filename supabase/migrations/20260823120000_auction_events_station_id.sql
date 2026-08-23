-- Identificador de "estación" (ordenador/pestaña) opcional, configurado a
-- mano una vez en la extensión — permite distinguir qué directo ha visto
-- cada ordenador cuando un mismo tenant tiene dos directos simultáneos
-- colgando de la misma tienda de TikTok (mismo shop_id, sin ningún campo en
-- la API que diga de qué directo viene un pedido).
ALTER TABLE public.auction_events_v2 ADD COLUMN IF NOT EXISTS station_id text;

CREATE INDEX IF NOT EXISTS idx_auction_events_v2_tenant_station_detected
  ON public.auction_events_v2 (tenant_id, station_id, detected_at DESC)
  WHERE winner IS NOT NULL;
