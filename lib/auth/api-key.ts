import "server-only";
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Genera una API key para la extensión Chrome de un tenant.
 * Se guarda un hash SHA-256 (para búsqueda indexada rápida) y un hash bcrypt
 * (verificación adicional más lenta), tal como prevé el esquema real de
 * api_keys (key_hash + bcrypt_hash). La key en claro solo se devuelve una vez.
 */
export async function generateApiKeyForTenant(tenantId: string): Promise<string> {
  const key = `el_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  const bcryptHash = await bcrypt.hash(key, 10);

  const { error } = await supabaseAdmin.from("api_keys").insert({
    tenant_id: tenantId,
    key_hash: keyHash,
    key_prefix: key.slice(0, 12),
    bcrypt_hash: bcryptHash,
    status: "active",
    name: "default",
  });
  if (error) throw new Error(`No se pudo crear la API key: ${error.message}`);

  return key;
}
