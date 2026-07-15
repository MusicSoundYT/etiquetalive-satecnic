import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { consumeMfaChallenge, issueMfaChallenge } from "@/lib/auth/mfa-challenge";
import { generateEmailCode, hashEmailCode, EMAIL_CODE_TTL_MS } from "@/lib/auth/mfa-email-code";
import { sendMfaCodeEmail } from "@/lib/mail/send-mfa-code-email";
import { isRateLimited } from "@/lib/auth/rate-limit";

/** Envía (o reenvía) el código de acceso por correo — segundo factor del login habitual. */
export async function POST() {
  const userId = await consumeMfaChallenge();
  if (!userId) {
    return NextResponse.json({ error: "Sesión de verificación caducada. Inicia sesión de nuevo." }, { status: 401 });
  }
  await issueMfaChallenge(userId);

  if (isRateLimited(`mfa-email-send:${userId}`)) {
    return NextResponse.json({ error: "Demasiadas peticiones. Inténtalo más tarde." }, { status: 429 });
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, email, mfa_enabled, mfa_method")
    .eq("id", userId)
    .maybeSingle();

  if (!user || !user.mfa_enabled || user.mfa_method !== "email") {
    return NextResponse.json({ error: "MFA por email no configurada." }, { status: 400 });
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
