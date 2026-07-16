-- Permite a un administrador eximir a un usuario concreto de la verificación
-- en dos pasos (p. ej. por petición expresa del cliente). Se comprueba en el
-- login ANTES de mirar mfa_enabled, así que si se activa, salta por completo
-- el paso de MFA aunque el usuario ya la tuviera configurada.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS mfa_exempt boolean NOT NULL DEFAULT false;
