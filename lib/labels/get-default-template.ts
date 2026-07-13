import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_TEMPLATE_VALUES, type LabelTemplate } from "@/lib/labels/types";

/** Devuelve la plantilla por defecto del tenant, creándola con valores de fábrica si no existe ninguna. */
export async function getDefaultTemplate(tenantId: string): Promise<LabelTemplate> {
  const { data: existing } = await supabaseAdmin
    .from("label_templates")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_default", true)
    .maybeSingle();

  if (existing) return existing as LabelTemplate;

  const { data: created, error } = await supabaseAdmin
    .from("label_templates")
    .insert({ tenant_id: tenantId, nombre: "Plantilla por defecto", is_default: true, ...DEFAULT_TEMPLATE_VALUES })
    .select("*")
    .single();

  if (error || !created) throw new Error(`No se pudo crear la plantilla por defecto: ${error?.message}`);
  return created as LabelTemplate;
}
