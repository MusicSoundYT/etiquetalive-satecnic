-- Segundo factor por email como alternativa al QR/TOTP: algunos usuarios no
-- disponen de una app de autenticación. "mfa_method" registra cuál de los dos
-- ha elegido/confirmado cada usuario; el código de un solo uso se guarda
-- hasheado (nunca en claro) junto con su caducidad de 5 minutos.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS mfa_method text,
    ADD COLUMN IF NOT EXISTS mfa_email_code_hash text,
    ADD COLUMN IF NOT EXISTS mfa_email_code_expires_at timestamptz;

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_mfa_method_check;
ALTER TABLE public.users
    ADD CONSTRAINT users_mfa_method_check CHECK (mfa_method IN ('totp', 'email'));

-- Las cuentas que ya tenían MFA activada antes de este cambio solo podían
-- haberlo hecho por TOTP (era el único método que existía).
UPDATE public.users SET mfa_method = 'totp' WHERE mfa_enabled = true AND mfa_method IS NULL;
