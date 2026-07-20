-- Permite volver a ver la clave API (cifrada de forma reversible, no solo
-- hasheada) para poder pegarla en un segundo ordenador sin tener que
-- regenerarla (lo que invalidaría la que ya tuviera configurada el primero).
-- Las claves ya existentes, creadas antes de este cambio, no tendrán este
-- campo relleno y seguirán sin poder recuperarse (solo regenerarse).
ALTER TABLE public.api_keys
    ADD COLUMN IF NOT EXISTS encrypted_key text;
