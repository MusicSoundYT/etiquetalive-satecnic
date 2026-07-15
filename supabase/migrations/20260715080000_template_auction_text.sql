-- Texto de la etiqueta superior (antes fijo a "SUBASTA"), configurable por
-- plantilla para que cada una pueda mostrar el texto que el cliente quiera.
ALTER TABLE public.label_templates
    ADD COLUMN IF NOT EXISTS auction_label_text text NOT NULL DEFAULT 'SUBASTA';
