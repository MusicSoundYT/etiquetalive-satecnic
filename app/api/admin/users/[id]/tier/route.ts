import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({ tier: z.number().int().min(1).max(3) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data: updated, error } = await supabaseAdmin
    .from("user_balances")
    .update({ current_tier: parsed.data.tier })
    .eq("user_id", id)
    .select("user_id, current_tier")
    .maybeSingle();

  if (error || !updated) return NextResponse.json({ error: "No se pudo actualizar el rango." }, { status: 404 });

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    admin_email: admin.email,
    action: "set_user_tier",
    target_user_id: id,
    details: { tier: parsed.data.tier },
  });

  return NextResponse.json({ status: "ok" });
}
