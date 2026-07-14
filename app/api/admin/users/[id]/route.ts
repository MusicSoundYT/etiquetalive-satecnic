import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  lastName: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().email(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const { name, lastName, email } = parsed.data;

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email)
    .neq("id", id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "Ese email ya está en uso." }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("users")
    .update({ name, last_name: lastName ?? null, email })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "No se pudo actualizar el usuario." }, { status: 500 });

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    admin_email: admin.email,
    action: "edit_user",
    target_user_id: id,
    details: { name, lastName: lastName ?? null, email },
  });

  return NextResponse.json({ status: "ok" });
}
