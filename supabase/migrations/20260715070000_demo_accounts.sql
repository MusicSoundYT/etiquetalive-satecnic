-- Migración aditiva. Permite marcar una cuenta como DEMO desde el panel de
-- admin: las impresiones de una cuenta DEMO no descuentan saldo real ni
-- comprueban bloqueo (ver app/api/orders/[id]/print/route.ts).

ALTER TABLE public.user_balances
    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
