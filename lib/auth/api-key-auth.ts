import "server-only";
import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Valida la API key de la extensión Chrome (header x-api-key). Devuelve el tenant_id o null.
 *
 * Ya no se compara además con bcrypt_hash: la key es un valor aleatorio de
 * 24 bytes (192 bits), y encontrar una fila por su hash SHA-256 exacto ya
 * prueba que quien llama tiene la key en claro — bcrypt existe para proteger
 * secretos de baja entropía (contraseñas) frente a fuerza bruta offline, algo
 * que no aporta nada aquí y sí añade ~50-100ms de CPU en cada petición. Esta
 * ruta la llama la extensión constantemente durante un directo (cada
 * escaneo, cada pedido detectado, cada impresión), así que ese coste se
 * multiplicaba por muchísimas peticiones por minuto.
 */
export async function validateApiKey(req: NextRequest): Promise<string | null> {
  const key = req.headers.get("x-api-key");
  if (!key || !key.startsWith("el_")) return null;

  const keyHash = createHash("sha256").update(key).digest("hex");
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, tenant_id, status, expires_at, revoked_at, use_count, last_used_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!data || data.status !== "active" || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;

  // El último salto de la cadena es el que añade nuestro propio proxy (nginx),
  // así que es el único valor en el que se puede confiar — el primero podría
  // venir falsificado por el propio cliente.
  const ip = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || null;
  // Esta ruta la llama la extensión varias veces por minuto durante un
  // directo — escribir en cada petición dobla las consultas a una base de
  // datos que ya va muy justa de recursos (proyecto en t4g.nano). Al ser
  // solo trazabilidad (nadie cobra ni factura a partir de esto), basta con
  // refrescarlo como mucho una vez por minuto — use_count queda aproximado
  // a propósito, no es un contador exacto.
  const lastUsedAgoMs = data.last_used_at ? Date.now() - new Date(data.last_used_at).getTime() : Infinity;
  if (lastUsedAgoMs > 60_000) {
    // No se espera esta escritura: no debe añadir latencia a la petición.
    supabaseAdmin
      .from("api_keys")
      .update({
        last_used_at: new Date().toISOString(),
        last_used_ip: ip,
        use_count: (data.use_count ?? 0) + 1,
      })
      .eq("id", data.id)
      .then(() => {}, () => {});
  }

  return data.tenant_id as string;
}
