-- Cada tenant tiene ahora su propia app de TikTok Shop (Partner Center) en
-- vez de una única app_key/app_secret/service_id global — necesario porque
-- una app "Desarrollador interno del vendedor" solo la puede autorizar la
-- tienda que la creó.
CREATE TABLE IF NOT EXISTS public.tiktok_shop_apps (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
    app_key text NOT NULL,
    app_secret text NOT NULL,
    service_id text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
