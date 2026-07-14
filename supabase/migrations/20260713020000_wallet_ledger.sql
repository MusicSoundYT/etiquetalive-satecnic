-- Función atómica para mover saldo: actualiza user_balances y registra el
-- movimiento en balance_transactions dentro de la misma transacción/fila
-- bloqueada, evitando condiciones de carrera con cobros concurrentes.
CREATE OR REPLACE FUNCTION public.adjust_balance(
    p_user_id uuid,
    p_amount_cents bigint,
    p_type text,
    p_description text DEFAULT NULL,
    p_stripe_payment_intent_id text DEFAULT NULL,
    p_related_detection_id uuid DEFAULT NULL,
    p_related_referral_id bigint DEFAULT NULL,
    p_metadata jsonb DEFAULT NULL
) RETURNS TABLE(balance_after_cents bigint, tx_id bigint)
LANGUAGE plpgsql
AS $$
DECLARE
    new_balance bigint;
    new_tx_id bigint;
BEGIN
    UPDATE public.user_balances
        SET balance_cents = balance_cents + p_amount_cents
        WHERE user_id = p_user_id
        RETURNING balance_cents INTO new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_balances no existe para user_id %', p_user_id;
    END IF;

    INSERT INTO public.balance_transactions (
        user_id, type, amount_cents, balance_after_cents,
        stripe_payment_intent_id, related_detection_id, related_referral_id,
        description, metadata
    ) VALUES (
        p_user_id, p_type, p_amount_cents, new_balance,
        p_stripe_payment_intent_id, p_related_detection_id, p_related_referral_id,
        p_description, p_metadata
    ) RETURNING id INTO new_tx_id;

    RETURN QUERY SELECT new_balance, new_tx_id;
END;
$$;
