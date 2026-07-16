import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { consumeMfaChallenge, issueMfaChallenge } from "@/lib/auth/mfa-challenge";
import { generateTotpSecret, generateTotpQrDataUrl, verifyTotpCode } from "@/lib/auth/totp";
import { createSession } from "@/lib/auth/session";
import { isRateLimited } from "@/lib/auth/rate-limit";

function clientIp(req: NextRequest): string {
  // Último salto = el que añade nuestro propio proxy (nginx); el primero
  // podría venir falsificado por el propio cliente.
  return req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
}

/** Genera (o recupera) el secreto TOTP pendiente de confirmar y devuelve el QR. */
export async function GET() {
  const userId = await consumeMfaChallengeKeepAlive();
  if (!userId) {
    return NextResponse.json({ error: "Reto de MFA no válido o caducado." }, { status: 401 });
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, email, mfa_enabled, totp_secret")
    .eq("id", userId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  if (user.mfa_enabled) {
    return NextResponse.json({ error: "El MFA ya está activado para esta cuenta." }, { status: 400 });
  }

  const secret = user.totp_secret ?? generateTotpSecret();
  if (!user.totp_secret) {
    await supabaseAdmin.from("users").update({ totp_secret: secret }).eq("id", userId);
  }

  const qrDataUrl = await generateTotpQrDataUrl(user.email, secret);
  return NextResponse.json({ qrDataUrl });
}

const bodySchema = z.object({ code: z.string().trim().length(6) });

/** Confirma el código escaneado y activa el MFA (método QR) de forma definitiva, abriendo sesión. */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const userId = await consumeMfaChallenge();
  if (!userId) {
    return NextResponse.json({ error: "Reto de MFA no válido o caducado." }, { status: 401 });
  }

  if (isRateLimited(`mfa:${userId}`)) {
    return NextResponse.json({ error: "Demasiados intentos. Inicia sesión de nuevo." }, { status: 429 });
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, totp_secret, mfa_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (!user || !user.totp_secret) {
    return NextResponse.json({ error: "Configura primero el código QR." }, { status: 400 });
  }
  if (user.mfa_enabled) {
    return NextResponse.json({ error: "El MFA ya está activado para esta cuenta." }, { status: 400 });
  }

  if (!(await verifyTotpCode(user.totp_secret, parsed.data.code))) {
    await issueMfaChallenge(userId); // deja reintentar sin repetir password
    return NextResponse.json({ error: "Código incorrecto." }, { status: 401 });
  }

  await supabaseAdmin
    .from("users")
    .update({ mfa_enabled: true, mfa_method: "totp", mfa_enrolled_at: new Date().toISOString() })
    .eq("id", userId);

  await createSession(userId, {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ status: "ok" });
}

// El GET necesita leer el reto sin consumirlo (el usuario puede recargar /mfa
// varias veces antes de introducir el código), así que reemitimos uno nuevo con la
// misma validez tras leerlo.
async function consumeMfaChallengeKeepAlive(): Promise<string | null> {
  const userId = await consumeMfaChallenge();
  if (!userId) return null;
  await issueMfaChallenge(userId);
  return userId;
}
