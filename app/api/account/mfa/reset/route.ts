import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser, revokeAllSessionsForUser, revokeCurrentSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { isRateLimited } from "@/lib/auth/rate-limit";
import { issueMfaChallenge } from "@/lib/auth/mfa-challenge";
import { sendMfaResetEmail } from "@/lib/mail/send-mfa-reset-email";

const bodySchema = z.object({ password: z.string().min(1) });

/**
 * El propio usuario, ya autenticado, pide cambiar de método de MFA (p. ej. de
 * QR a email). Exige repetir la contraseña para que no baste con tener la
 * sesión abierta en un dispositivo compartido. Cierra todas las sesiones
 * (incluida la actual) y emite un nuevo reto de MFA para que, sin salir del
 * flujo, /mfa le lleve directo a elegir el nuevo método.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  if (isRateLimited(`mfa-self-reset:${user.id}`)) {
    return NextResponse.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data: dbUser } = await supabaseAdmin
    .from("users")
    .select("password_hash")
    .eq("id", user.id)
    .maybeSingle();

  if (!dbUser?.password_hash || !(await verifyPassword(parsed.data.password, dbUser.password_hash))) {
    return NextResponse.json({ error: "La contraseña no es correcta." }, { status: 401 });
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
    .eq("id", user.id);

  await revokeAllSessionsForUser(user.id);
  await revokeCurrentSession();
  await issueMfaChallenge(user.id);
  await sendMfaResetEmail(user.email, { byAdmin: false });

  return NextResponse.json({ status: "ok" });
}
