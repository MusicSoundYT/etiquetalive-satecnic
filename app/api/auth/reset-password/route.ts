import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { consumePasswordResetToken } from "@/lib/auth/password-reset";
import { hashPassword, validatePasswordPolicy, PASSWORD_POLICY_MESSAGE } from "@/lib/auth/password";
import { isRateLimited } from "@/lib/auth/rate-limit";

const bodySchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(1),
});

function clientIp(req: NextRequest): string {
  // Último salto = el que añade nuestro propio proxy (nginx); el primero
  // podría venir falsificado por el propio cliente.
  return req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isRateLimited(`reset:${ip}`)) {
    return NextResponse.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  if (!validatePasswordPolicy(parsed.data.password)) {
    return NextResponse.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 });
  }

  // Consumir el token PRIMERO (un solo uso): si esta llamada falla o no llega a
  // actualizar la contraseña, el token ya no puede reutilizarse para reintentar.
  const userId = await consumePasswordResetToken(parsed.data.token);
  if (!userId) {
    return NextResponse.json({ error: "El enlace no es válido o ha caducado." }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const { error } = await supabaseAdmin
    .from("users")
    .update({ password_hash: passwordHash })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: "No se pudo actualizar la contraseña." }, { status: 500 });
  }

  // Revoca todas las sesiones activas de ese usuario tras un reset de contraseña.
  await supabaseAdmin
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);

  return NextResponse.json({ status: "ok" });
}
