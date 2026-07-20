import "server-only";
import { cache } from "react";
import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SESSION_COOKIE = "el_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días, igual que el default de auth_sessions

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionUser = {
  id: string;
  tenant_id: string | null;
  email: string;
  name: string | null;
  last_name: string | null;
  is_admin: boolean;
  mfa_enabled: boolean;
};

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null }
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { error } = await supabaseAdmin.from("auth_sessions").insert({
    user_id: userId,
    token_hash: tokenHash,
    ip: meta.ip ?? null,
    user_agent: meta.userAgent ?? null,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`No se pudo crear la sesión: ${error.message}`);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });

  return token;
}

// Envuelto en React cache(): tanto el layout protegido como cada página
// (dashboard, account, admin...) llaman a getSessionUser() por su cuenta, y
// sin este cache() eso significaba repetir las 2 consultas a Supabase
// (auth_sessions + users) en cada una — el doble de ida y vuelta de red por
// cada navegación, notándose como lentitud aunque el servidor esté ligero
// (es tiempo de espera de red, no de CPU). cache() memoiza por petición: la
// segunda llamada dentro del mismo render reutiliza el resultado sin volver
// a golpear la base de datos.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const { data: session } = await supabaseAdmin
    .from("auth_sessions")
    .select("user_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  supabaseAdmin
    .from("auth_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .then(() => {});

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, tenant_id, email, name, last_name, is_admin, mfa_enabled")
    .eq("id", session.user_id)
    .maybeSingle();

  return user as SessionUser | null;
});

/** Revoca TODAS las sesiones activas de un usuario (cierre de sesión en todos los dispositivos). */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await supabaseAdmin
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
}

export async function revokeCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    await supabaseAdmin
      .from("auth_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", tokenHash);
  }
  jar.delete(SESSION_COOKIE);
}
