-- Conexión OAuth con la API oficial de TikTok Shop (Partner Center), para
-- dejar de depender solo de la extensión de Chrome. Fase 1: solo conectar y
-- poder consultar pedidos de prueba — no sustituye todavía a la extensión.
CREATE TABLE IF NOT EXISTS public.tiktok_shop_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    open_id text NOT NULL,
    seller_name text,
    seller_base_region text,
    access_token text NOT NULL,
    access_token_expires_at timestamptz NOT NULL,
    refresh_token text NOT NULL,
    refresh_token_expires_at timestamptz NOT NULL,
    granted_scopes jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, open_id)
);

-- Una conexión puede dar acceso a varias tiendas (una cuenta "cross-border"
-- vende en varios países) — cada una con su propio identificador según el
-- sentido de la llamada: shop_cipher para pedir datos, shop_id para lo que
-- llega en los webhooks (fase futura). El cipher puede cambiar si se vuelve
-- a autorizar, así que se refresca en cada conexión en vez de darlo por fijo.
CREATE TABLE IF NOT EXISTS public.tiktok_shop_shops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id uuid NOT NULL REFERENCES public.tiktok_shop_connections(id) ON DELETE CASCADE,
    shop_id text NOT NULL,
    shop_cipher text NOT NULL,
    shop_name text,
    region text,
    seller_type text,
    shop_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (connection_id, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_shop_connections_tenant
    ON public.tiktok_shop_connections (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tiktok_shop_shops_connection
    ON public.tiktok_shop_shops (connection_id);

DROP TRIGGER IF EXISTS trg_tiktok_shop_connections_updated_at ON public.tiktok_shop_connections;
CREATE TRIGGER trg_tiktok_shop_connections_updated_at
    BEFORE UPDATE ON public.tiktok_shop_connections
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_tiktok_shop_shops_updated_at ON public.tiktok_shop_shops;
CREATE TRIGGER trg_tiktok_shop_shops_updated_at
    BEFORE UPDATE ON public.tiktok_shop_shops
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Igual que el resto de tablas: solo se accede desde el servidor con la
-- clave de rol de servicio, así que se activa RLS sin políticas (denegar
-- por defecto al acceso público) en vez de dejarlo desactivado.
ALTER TABLE public.tiktok_shop_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_shop_shops ENABLE ROW LEVEL SECURITY;
