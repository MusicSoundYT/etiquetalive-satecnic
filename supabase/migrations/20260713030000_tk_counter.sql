-- Contador de TK por tenant (equivalente al tk_counter del legacy), para
-- generar identificadores tipo TK-00001 de forma atómica y sin colisiones.
CREATE TABLE IF NOT EXISTS public.tk_counters (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
    next_value integer NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION public.next_tk(p_tenant_id uuid) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v integer;
BEGIN
    INSERT INTO public.tk_counters (tenant_id, next_value)
        VALUES (p_tenant_id, 2)
        ON CONFLICT (tenant_id) DO UPDATE SET next_value = public.tk_counters.next_value + 1
        RETURNING next_value - 1 INTO v;
    RETURN 'TK-' || lpad(v::text, 5, '0');
END;
$$;
