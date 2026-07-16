-- Aviso de saldo negativo: registra cuándo se notificó por última vez al
-- cliente que su saldo está en negativo, para no enviar un correo por cada
-- intento de impresión bloqueado durante un mismo directo. Se resetea a NULL
-- en cuanto recarga saldo, para que un futuro episodio vuelva a avisar.
ALTER TABLE public.user_balances
    ADD COLUMN IF NOT EXISTS low_balance_notified_at timestamptz;
