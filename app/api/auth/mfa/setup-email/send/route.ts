import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { consumeMfaChallenge, issueMfaChallenge } from "@/lib/auth/mfa-challenge";
import { generateEmailCode, hashEmailCode, EMAIL_CODE_TTL_MS } from "@/lib/auth/mfa-email-code";
import { sendMfaCodeEmail } from "@/lib/mail/send-mfa-code-email";
import { isRateLimited } from "@/lib/auth/rate-limit";

/** Genera y envía por correo el código de un solo uso para activar el MFA por email. */
export async function POST() {
  const userId = await consumeMfaChallenge();
  if (!userId) {
    return NextResponse.json({ error: "Reto de MFA no válido o caducado." }, { status: 401 });
  }
  await issueMfaChallenge(userId); // deja completar el formulario sin repetir password

  if (isRateLimited(`mfa-email-send:${userId}`)) {
    return NextResponse.json({ error: "Demasiadas peticiones. Inténtalo más tarde." }, { status: 429 });
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, email, mfa_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  if (user.mfa_enabled) {
    return NextResponse.json({ error: "El MFA ya está activado para esta cuenta." }, { status: 400 });
  }

  const code = generateEmailCode();
  await supabaseAdmin
    .from("users")
    .update({
      mfa_email_code_hash: hashEmailCode(code),
      mfa_email_code_expires_at: new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString(),
    })
    .eq("id", userId);

  await sendMfaCodeEmail(user.email, code);

  return NextResponse.json({ status: "ok" });
}
