import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { templateFieldsSchema } from "@/lib/labels/schema";

const bodySchema = z.object({ nombre: z.string().trim().min(1).max(60) }).merge(templateFieldsSchema);

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("label_templates")
    .update(parsed.data)
    .eq("id", id)
    .eq("tenant_id", user.tenant_id)
    .select("*")
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "No se pudo actualizar la plantilla." }, { status: 404 });
  return NextResponse.json({ template: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: tpl } = await supabaseAdmin
    .from("label_templates")
    .select("is_default")
    .eq("id", id)
    .eq("tenant_id", user.tenant_id)
    .maybeSingle();

  if (!tpl) return NextResponse.json({ error: "Plantilla no encontrada." }, { status: 404 });
  if (tpl.is_default) {
    return NextResponse.json({ error: "No puedes borrar la plantilla por defecto." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("label_templates").delete().eq("id", id).eq("tenant_id", user.tenant_id);
  if (error) return NextResponse.json({ error: "No se pudo borrar la plantilla." }, { status: 500 });

  return NextResponse.json({ status: "ok" });
}
