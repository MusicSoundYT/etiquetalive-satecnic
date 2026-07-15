import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, revokeAllSessionsForUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendMfaResetEmail } from "@/lib/mail/send-mfa-reset-email";

/**
 * Restablece la verificación en dos pasos de un usuario (p. ej. si ha perdido
 * el móvil con la app de autenticación y se ha quedado sin poder entrar):
 * borra el método/secreto configurados y cierra todas sus sesiones activas,
 * para que en el próximo login se le vuelva a pedir elegir método (QR o email).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const { data: target } = await supabaseAdmin
    .from("users")
    .select("id, email, mfa_enabled, mfa_method")
    .eq("id", id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  if (!target.mfa_enabled) {
    return NextResponse.json(
      { error: "Este usuario no tiene la verificación en dos pasos activada." },
      { status: 400 }
    );
  }

  await supabaseAdmin
    .from("users")
    .update({
      mfa_enabled: false,
      mfa_method: null,
      totp_secret: null,
      mfa_email_code_hash: null,
      mfa_email_code_expires_at: null,
      mfa_enrolled_at: null,
    })
    .eq("id", id);

  await revokeAllSessionsForUser(id);

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    admin_email: admin.email,
    action: "reset_mfa",
    target_user_id: id,
    details: { previous_method: target.mfa_method },
  });

  await sendMfaResetEmail(target.email, { byAdmin: true });

  return NextResponse.json({ status: "ok" });
}
