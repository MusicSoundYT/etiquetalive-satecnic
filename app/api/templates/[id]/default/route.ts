import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: tpl } = await supabaseAdmin
    .from("label_templates")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", user.tenant_id)
    .maybeSingle();
  if (!tpl) return NextResponse.json({ error: "Plantilla no encontrada." }, { status: 404 });

  // El índice único parcial (is_default = true por tenant) exige quitarlo antes de ponerlo en la otra.
  await supabaseAdmin.from("label_templates").update({ is_default: false }).eq("tenant_id", user.tenant_id);
  const { error } = await supabaseAdmin.from("label_templates").update({ is_default: true }).eq("id", id);

  if (error) return NextResponse.json({ error: "No se pudo marcar como predeterminada." }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
