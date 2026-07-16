import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { consumeMfaChallenge, issueMfaChallenge } from "@/lib/auth/mfa-challenge";
import { verifyEmailCode } from "@/lib/auth/mfa-email-code";
import { createSession } from "@/lib/auth/session";
import { isRateLimited } from "@/lib/auth/rate-limit";

const bodySchema = z.object({ code: z.string().trim().length(6) });

function clientIp(req: NextRequest): string {
  // Último salto = el que añade nuestro propio proxy (nginx); el primero
  // podría venir falsificado por el propio cliente.
  return req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
}

/** Segundo factor del login habitual, para cuentas con MFA por email. */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const userId = await consumeMfaChallenge();
  if (!userId) {
    return NextResponse.json({ error: "Sesión de verificación caducada. Inicia sesión de nuevo." }, { status: 401 });
  }

  if (isRateLimited(`mfa:${userId}`)) {
    return NextResponse.json({ error: "Demasiados intentos. Inicia sesión de nuevo." }, { status: 429 });
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, mfa_enabled, mfa_method, mfa_email_code_hash, mfa_email_code_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (!user || !user.mfa_enabled || user.mfa_method !== "email" || !user.mfa_email_code_hash) {
    return NextResponse.json({ error: "MFA por email no configurada." }, { status: 400 });
  }

  const expired =
    !user.mfa_email_code_expires_at || new Date(user.mfa_email_code_expires_at).getTime() < Date.now();
  if (expired || !verifyEmailCode(parsed.data.code, user.mfa_email_code_hash)) {
    await issueMfaChallenge(userId); // permite reintentar dentro de la ventana de 5 min
    return NextResponse.json({ error: expired ? "El código ha caducado." : "Código incorrecto." }, { status: 401 });
  }

  await supabaseAdmin
    .from("users")
    .update({ mfa_email_code_hash: null, mfa_email_code_expires_at: null })
    .eq("id", userId);

  await createSession(userId, {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ status: "ok" });
}
