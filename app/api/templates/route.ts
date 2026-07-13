import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_TEMPLATE_VALUES } from "@/lib/labels/types";
import { templateFieldsSchema } from "@/lib/labels/schema";
import { getDefaultTemplate } from "@/lib/labels/get-default-template";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  await getDefaultTemplate(user.tenant_id); // asegura que exista al menos una

  const { data, error } = await supabaseAdmin
    .from("label_templates")
    .select("*")
    .eq("tenant_id", user.tenant_id)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "No se pudieron cargar las plantillas." }, { status: 500 });
  return NextResponse.json({ templates: data });
}

const bodySchema = z.object({ nombre: z.string().trim().min(1).max(60) }).merge(templateFieldsSchema);

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("label_templates")
    .insert({ tenant_id: user.tenant_id, is_default: false, ...DEFAULT_TEMPLATE_VALUES, ...parsed.data })
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: "No se pudo crear la plantilla." }, { status: 500 });
  return NextResponse.json({ template: data });
}
