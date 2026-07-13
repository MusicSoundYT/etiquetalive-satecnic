-- Plantillas de etiqueta (equivalente a configuracion_plantilla/plantillas_etiqueta
-- del legacy) — controla qué campos se imprimen, en qué orden, tamaños de fuente
-- y dimensiones físicas de la etiqueta.
CREATE TABLE IF NOT EXISTS public.label_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    nombre text NOT NULL DEFAULT 'Plantilla',
    is_default boolean NOT NULL DEFAULT false,

    label_width_mm numeric NOT NULL DEFAULT 60,
    label_height_mm numeric NOT NULL DEFAULT 29,

    show_auction boolean NOT NULL DEFAULT true,
    show_cliente boolean NOT NULL DEFAULT true,
    show_tiktok_name boolean NOT NULL DEFAULT true,
    show_order_id boolean NOT NULL DEFAULT true,
    show_price boolean NOT NULL DEFAULT true,
    show_datetime boolean NOT NULL DEFAULT true,
    show_qr boolean NOT NULL DEFAULT true,

    order_auction smallint NOT NULL DEFAULT 1,
    order_cliente smallint NOT NULL DEFAULT 2,
    order_tiktok_name smallint NOT NULL DEFAULT 3,
    order_order_id smallint NOT NULL DEFAULT 4,
    order_price smallint NOT NULL DEFAULT 5,
    order_datetime smallint NOT NULL DEFAULT 6,

    auction_font_pt numeric NOT NULL DEFAULT 9,
    customer_font_pt numeric NOT NULL DEFAULT 8.4,
    tiktok_font_pt numeric NOT NULL DEFAULT 8.4,
    order_font_pt numeric NOT NULL DEFAULT 7,
    price_font_pt numeric NOT NULL DEFAULT 10.5,
    date_font_pt numeric NOT NULL DEFAULT 5.4,
    label_font_pt numeric NOT NULL DEFAULT 10,

    qr_size_mm numeric NOT NULL DEFAULT 13,
    line_spacing_mm numeric NOT NULL DEFAULT 1.4,
    title_data_gap_mm numeric NOT NULL DEFAULT 0,
    letter_spacing_pt numeric NOT NULL DEFAULT 0,
    label_col_width_mm numeric NOT NULL DEFAULT 24,
    column_gap_mm numeric NOT NULL DEFAULT 2,
    padding_mm numeric NOT NULL DEFAULT 1,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_label_templates_tenant ON public.label_templates (tenant_id);

DROP TRIGGER IF EXISTS trg_label_templates_updated_at ON public.label_templates;
CREATE TRIGGER trg_label_templates_updated_at
    BEFORE UPDATE ON public.label_templates
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Solo puede haber una plantilla por defecto por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_label_templates_one_default
    ON public.label_templates (tenant_id)
    WHERE is_default;
