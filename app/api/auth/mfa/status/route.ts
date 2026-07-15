import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { consumeMfaChallenge, issueMfaChallenge } from "@/lib/auth/mfa-challenge";

/**
 * Consulta de solo lectura para que /mfa decida qué pantalla mostrar: si el
 * usuario aún no tiene MFA configurada (elegir método) o ya la tiene (pedir
 * el código, por TOTP o por email según corresponda). No genera secretos ni
 * envía correos — eso lo hacen los endpoints de setup/verify específicos.
 */
export async function GET() {
  const userId = await consumeMfaChallenge();
  if (!userId) {
    return NextResponse.json({ error: "Reto de MFA no válido o caducado." }, { status: 401 });
  }
  // Se reemite el reto tras leerlo: el usuario puede recargar /mfa varias
  // veces antes de completar el segundo factor.
  await issueMfaChallenge(userId);

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("mfa_enabled, mfa_method")
    .eq("id", userId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  return NextResponse.json({ enrolled: user.mfa_enabled, method: user.mfa_method });
}
