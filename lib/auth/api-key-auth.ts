import "server-only";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Valida la API key de la extensión Chrome (header x-api-key). Devuelve el tenant_id o null. */
export async function validateApiKey(req: NextRequest): Promise<string | null> {
  const key = req.headers.get("x-api-key");
  if (!key || !key.startsWith("el_")) return null;

  const keyHash = createHash("sha256").update(key).digest("hex");
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, tenant_id, status, expires_at, revoked_at, bcrypt_hash, use_count")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!data || data.status !== "active" || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  if (data.bcrypt_hash && !(await bcrypt.compare(key, data.bcrypt_hash))) return null;

  // El último salto de la cadena es el que añade nuestro propio proxy (nginx),
  // así que es el único valor en el que se puede confiar — el primero podría
  // venir falsificado por el propio cliente.
  const ip = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || null;
  await supabaseAdmin
    .from("api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      last_used_ip: ip,
      use_count: (data.use_count ?? 0) + 1,
    })
    .eq("id", data.id);

  return data.tenant_id as string;
}
