import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type TikTokAppCredentials = {
  appKey: string;
  appSecret: string;
  serviceId: string;
};

/**
 * Cada tenant registra su propia app en el Partner Center de TikTok (tipo
 * "Desarrollador interno del vendedor" — sin revisión de TikTok, pero por
 * eso mismo solo la puede autorizar la tienda que la creó, así que cada
 * cliente necesita la suya). Sin esto no se puede ni empezar el flujo de
 * conexión (hace falta el service_id para la URL de autorización).
 */
export async function getAppCredentialsForTenant(tenantId: string): Promise<TikTokAppCredentials> {
  const { data, error } = await supabaseAdmin
    .from("tiktok_shop_apps")
    .select("app_key, app_secret, service_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`No se pudieron leer las credenciales de TikTok Shop: ${error.message}`);
  if (!data) throw new Error("Configura primero tu propia app de TikTok Shop en Configuración.");
  return { appKey: data.app_key, appSecret: data.app_secret, serviceId: data.service_id };
}

export async function getAppCredentialsForTenantOrNull(tenantId: string): Promise<TikTokAppCredentials | null> {
  try {
    return await getAppCredentialsForTenant(tenantId);
  } catch {
    return null;
  }
}

export async function saveAppCredentialsForTenant(tenantId: string, creds: TikTokAppCredentials): Promise<void> {
  const { error } = await supabaseAdmin
    .from("tiktok_shop_apps")
    .upsert(
      { tenant_id: tenantId, app_key: creds.appKey, app_secret: creds.appSecret, service_id: creds.serviceId, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" }
    );
  if (error) throw new Error(`No se pudieron guardar las credenciales de TikTok Shop: ${error.message}`);
}
