import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  lastName: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().email(),
  isAdmin: z.boolean(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const { name, lastName, email, isAdmin } = parsed.data;

  // Ningún administrador puede quitarse el rol a sí mismo desde aquí — evita
  // que alguien se bloquee el acceso a Administración por error.
  if (id === admin.id && !isAdmin) {
    return NextResponse.json({ error: "No puedes quitarte el rol de administrador a ti mismo." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email)
    .neq("id", id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "Ese email ya está en uso." }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("users")
    .update({ name, last_name: lastName ?? null, email, is_admin: isAdmin })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "No se pudo actualizar el usuario." }, { status: 500 });

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    admin_email: admin.email,
    action: "edit_user",
    target_user_id: id,
    details: { name, lastName: lastName ?? null, email, isAdmin },
  });

  return NextResponse.json({ status: "ok" });
}
