import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({ isDemo: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data: updated, error } = await supabaseAdmin
    .from("user_balances")
    .update({ is_demo: parsed.data.isDemo })
    .eq("user_id", id)
    .select("user_id, is_demo")
    .maybeSingle();

  if (error || !updated) return NextResponse.json({ error: "No se pudo actualizar." }, { status: 404 });

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    admin_email: admin.email,
    action: "set_user_demo",
    target_user_id: id,
    details: { is_demo: parsed.data.isDemo },
  });

  return NextResponse.json({ status: "ok" });
}
