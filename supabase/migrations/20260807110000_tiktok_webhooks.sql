-- Impresión automática por API (webhooks de TikTok Shop): cuando cambia el
-- estado de un pedido, TikTok avisa a nuestro servidor al instante en vez de
-- que nosotros tengamos que ir preguntando.

-- Idempotencia: TikTok puede reenviar el mismo aviso más de una vez (lo
-- advierte su propia documentación) — se descarta cualquier repetido por
-- tts_notification_id, igual que ya se hace con los eventos de Stripe.
CREATE TABLE IF NOT EXISTS public.tiktok_webhook_events (
    notification_id text PRIMARY KEY,
    event_type text,
    shop_id text,
    payload jsonb,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    processing_error text
);

ALTER TABLE public.tiktok_webhook_events ENABLE ROW LEVEL SECURITY;

-- Marca cuándo se le entregó de verdad la etiqueta a un navegador para
-- imprimir (window.print() invocado), separado de impresiones_cobrables
-- (que solo indica que se ha cobrado). Con la extensión, cobro e impresión
-- ocurren en el mismo instante desde la misma pestaña, así que hasta ahora
-- no hacía falta distinguirlos — pero con el aviso automático por webhook,
-- el pedido se cobra al instante en el servidor y la impresión real ocurre
-- un poco después, cuando el navegador (con una pestaña de Pedidos (API)
-- abierta) lo recoge. Esta columna evita que el mismo pedido se imprima dos
-- veces si lo coge tanto la extensión como esta vía nueva: quien llegue
-- primero (mark-print-api de la extensión, o el sondeo del navegador) la
-- reclama de forma atómica.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS label_delivered_at timestamptz;
