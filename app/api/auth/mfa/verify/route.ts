import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { consumeMfaChallenge, issueMfaChallenge } from "@/lib/auth/mfa-challenge";
import { verifyTotpCode } from "@/lib/auth/totp";
import { createSession } from "@/lib/auth/session";
import { isRateLimited } from "@/lib/auth/rate-limit";

const bodySchema = z.object({ code: z.string().trim().length(6) });

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Segundo factor del login habitual (usuario ya tiene MFA activada). */
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
    .select("id, totp_secret, mfa_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (!user || !user.mfa_enabled || !user.totp_secret) {
    return NextResponse.json({ error: "MFA no configurada." }, { status: 400 });
  }

  if (!(await verifyTotpCode(user.totp_secret, parsed.data.code))) {
    await issueMfaChallenge(userId); // permite reintentar dentro de la ventana de 5 min
    return NextResponse.json({ error: "Código incorrecto." }, { status: 401 });
  }

  await createSession(userId, {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ status: "ok" });
}
