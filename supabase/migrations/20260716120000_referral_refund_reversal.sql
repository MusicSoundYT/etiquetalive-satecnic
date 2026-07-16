-- Guarda qué recarga (payment_intent) fue la que dio origen al bono de
-- referido, para poder revertir el bono SOLO si esa recarga concreta se
-- reembolsa (no cualquier recarga posterior del mismo usuario).
ALTER TABLE public.referrals
    ADD COLUMN IF NOT EXISTS qualifying_stripe_payment_intent_id text;

-- Nuevo estado "refunded": el bono se pagó pero se ha revertido porque la
-- recarga que lo originó fue reembolsada.
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_status_check
    CHECK (status = ANY (ARRAY['pending', 'first_recharged', 'qualified', 'paid', 'rejected', 'refunded']));
