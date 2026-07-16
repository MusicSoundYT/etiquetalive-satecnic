import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendMfaExemptEmail } from "@/lib/mail/send-mfa-exempt-email";

const bodySchema = z.object({ exempt: z.boolean() });

/**
 * Exime (o deja de eximir) a un usuario del requisito de verificación en dos
 * pasos, a petición expresa del cliente. Solo un administrador puede
 * activarlo, queda registrado en el log de auditoría y se avisa por email al
 * usuario afectado (en ambos sentidos), para que quede constancia de que el
 * cambio es intencionado y no un fallo o un acceso no autorizado.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data: target } = await supabaseAdmin.from("users").select("id, email").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("users")
    .update({ mfa_exempt: parsed.data.exempt })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    admin_email: admin.email,
    action: parsed.data.exempt ? "mfa_exempt_enable" : "mfa_exempt_disable",
    target_user_id: id,
    details: {},
  });

  await sendMfaExemptEmail(target.email, parsed.data.exempt).catch(() => {});

  return NextResponse.json({ status: "ok" });
}
