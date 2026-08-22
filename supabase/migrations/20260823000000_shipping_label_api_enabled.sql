-- Interruptor por tenant para la generación de etiqueta de envío por API
-- (Caja TikTok, piloto con Woow Insólito y MagicDays) — apagarlo aquí basta
-- para desactivar la función sin tocar código ni desplegar nada, en caso de
-- que dé problemas durante la prueba.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS shipping_label_api_enabled boolean NOT NULL DEFAULT false;

UPDATE public.tenants SET shipping_label_api_enabled = true
WHERE id IN (
  '17edac49-7e7c-45d8-9b16-4baa7b7ac8fe', -- Woow Insólito
  '3e4cb6e8-74e0-4ed4-863d-578d2ce9df55'  -- Magic Days
);
