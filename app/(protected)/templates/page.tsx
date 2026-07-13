import { requireSession } from "@/lib/auth/require-session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDefaultTemplate } from "@/lib/labels/get-default-template";
import { TemplateDesigner } from "@/components/template-designer";
import type { LabelTemplate } from "@/lib/labels/types";

export default async function TemplatesPage() {
  const user = await requireSession();

  await getDefaultTemplate(user.tenant_id!); // asegura que exista al menos una

  const { data } = await supabaseAdmin
    .from("label_templates")
    .select("*")
    .eq("tenant_id", user.tenant_id!)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Plantilla de etiqueta</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Elige qué datos salen impresos y previsualiza la etiqueta en tiempo real.
        </p>
      </div>
      <TemplateDesigner initialTemplates={(data ?? []) as LabelTemplate[]} />
    </div>
  );
}
