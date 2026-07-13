-- Migración aditiva para la reescritura a Next.js.
-- No modifica ni borra ninguna tabla/columna existente. Idempotente (se puede re-ejecutar).

-- 1. Tabla canónica de pedidos ("orders"). Sustituye conceptualmente a la vieja
--    tabla "pedidos" de SQLite; ni order_detections ni orders_processed sirven
--    solas para esto (ver informe de exploración: la primera vacía/sin usar,
--    la segunda es solo el ledger de facturación).
CREATE TABLE IF NOT EXISTS public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    tk text NOT NULL,
    external_order_id text,
    cliente text,
    precio_cents integer NOT NULL DEFAULT 0,
    moneda text NOT NULL DEFAULT 'EUR',
    fecha_pedido timestamptz,
    fecha_detectado timestamptz NOT NULL DEFAULT now(),
    estado_impresion text NOT NULL DEFAULT 'detectado'
        CHECK (estado_impresion IN ('detectado', 'impreso', 'reimpreso')),
    fecha_impresion timestamptz,
    reimpresiones integer NOT NULL DEFAULT 0,
    impresiones_cobrables integer NOT NULL DEFAULT 0,
    notes text,
    raw_payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT orders_tenant_tk_unique UNIQUE (tenant_id, tk)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_fecha
    ON public.orders (tenant_id, fecha_detectado DESC);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Rangos/tiers de precio por etiqueta, editables por el admin.
CREATE TABLE IF NOT EXISTS public.pricing_tiers (
    tier smallint PRIMARY KEY CHECK (tier IN (1, 2, 3)),
    price_cents integer NOT NULL,
    label text NOT NULL
);

INSERT INTO public.pricing_tiers (tier, price_cents, label) VALUES
    (1, 10, 'Básico'),
    (2, 8, 'Pro'),
    (3, 6, 'Premium')
ON CONFLICT (tier) DO NOTHING;

-- 3. MFA obligatoria + apellidos en perfil de usuario.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS totp_secret text,
    ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_name text;

-- 4. Trazabilidad entre el ledger de facturación y el pedido real.
ALTER TABLE public.orders_processed
    ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id);
