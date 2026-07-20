import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateApiKeyForTenant } from "@/lib/auth/api-key";

const KEY_META_COLUMNS = "id, key_prefix, status, created_at, last_used_at";

/** Metadatos de la key activa del tenant (el valor en claro no viaja aquí: usar /reveal). */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("api_keys")
    .select(KEY_META_COLUMNS)
    .eq("tenant_id", user.tenant_id)
    .eq("status", "active")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ apiKey: data ?? null });
}

/**
 * Genera una nueva API key para la extensión Chrome. Si ya había una activa, se
 * revoca (solo puede haber una viva a la vez) — el cliente tendrá que volver a
 * pegar la nueva en la extensión. El valor en claro solo se devuelve en esta
 * respuesta: a partir de aquí solo se guarda su hash.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  await supabaseAdmin
    .from("api_keys")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("tenant_id", user.tenant_id)
    .eq("status", "active")
    .is("revoked_at", null);

  const key = await generateApiKeyForTenant(user.tenant_id);

  const { data: apiKey } = await supabaseAdmin
    .from("api_keys")
    .select(KEY_META_COLUMNS)
    .eq("tenant_id", user.tenant_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ key, apiKey });
}
