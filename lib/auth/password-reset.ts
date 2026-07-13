import "server-only";
import { randomBytes, createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutos

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(userId: string, requestIp: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await supabaseAdmin.from("password_reset_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    request_ip: requestIp,
  });
  if (error) throw new Error(`No se pudo generar el token de reseteo: ${error.message}`);

  return token;
}

/** Valida el token (sin consumirlo) y devuelve el user_id, o null si no es válido. */
export async function peekPasswordResetToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);
  const { data } = await supabaseAdmin
    .from("password_reset_tokens")
    .select("user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.user_id;
}

/** Valida y marca el token como usado (un solo uso). Devuelve el user_id o null. */
export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);
  const { data } = await supabaseAdmin
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  const { data: updated, error } = await supabaseAdmin
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("used_at", null)
    .select("id");
  if (error || !updated || updated.length === 0) return null; // ya consumido por otra petición concurrente

  return data.user_id;
}
