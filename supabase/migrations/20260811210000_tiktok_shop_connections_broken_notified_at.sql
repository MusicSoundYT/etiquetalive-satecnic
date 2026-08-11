-- Cooldown para el aviso "la conexión con TikTok Shop ha dejado de
-- funcionar" (app/api/cron/check-tiktok-connections): se rellena al avisar
-- de una rotura, y se vacía en cuanto vuelve a funcionar — así una rotura
-- larga no manda un Telegram cada vez que corre el cron, pero una rotura
-- nueva (tras haberse recuperado) sí vuelve a avisar.
ALTER TABLE public.tiktok_shop_connections
    ADD COLUMN IF NOT EXISTS broken_notified_at timestamptz;
