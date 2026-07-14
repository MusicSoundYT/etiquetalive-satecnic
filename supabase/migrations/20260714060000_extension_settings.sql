-- Migración aditiva. Añade la configuración de la extensión Chrome que existía
-- en el sistema legacy (impresión automática al detectar pedido, y frecuencia
-- de refresco de Seller Orders), a nivel de tenant, ya que la extensión se
-- autentica con una API key por tenant (no por usuario individual).

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS auto_print_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS seller_refresh_seconds integer NOT NULL DEFAULT 15;
