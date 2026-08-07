import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";
import { exchangeAuthCode, refreshAccessToken, type TikTokTokenData } from "@/lib/tiktok-shop/auth";
import { getAuthorizedShops, registerOrderStatusWebhook } from "@/lib/tiktok-shop/api-client";

// Margen antes de que caduque el access_token (dura 7 días) para renovarlo
// ya, en vez de esperar a que falle una llamada real.
const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000;

export type TikTokShopConnection = {
  id: string;
  tenant_id: string;
  open_id: string;
  seller_name: string | null;
  seller_base_region: string | null;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
  granted_scopes: string[] | null;
};

export type TikTokShopRow = {
  id: string;
  shop_id: string;
  shop_cipher: string;
  shop_name: string | null;
  region: string | null;
  seller_type: string | null;
  shop_code: string | null;
};

function tokenDataToRow(tenantId: string, data: TikTokTokenData) {
  return {
    tenant_id: tenantId,
    open_id: data.open_id,
    seller_name: data.seller_name,
    seller_base_region: data.seller_base_region,
    access_token: data.access_token,
    access_token_expires_at: new Date(data.access_token_expire_in * 1000).toISOString(),
    refresh_token: data.refresh_token,
    refresh_token_expires_at: new Date(data.refresh_token_expire_in * 1000).toISOString(),
    granted_scopes: data.granted_scopes,
  };
}

/**
 * Guarda la conexión tras el intercambio inicial del "code", y refresca la
 * lista de tiendas autorizadas (el cipher puede cambiar entre
 * autorizaciones, así que no se asume estable).
 */
export async function saveConnectionFromAuthCode(
  tenantId: string,
  authCode: string
): Promise<TikTokShopConnection> {
  const tokenData = await exchangeAuthCode(authCode);

  const { data: connection, error } = await supabaseAdmin
    .from("tiktok_shop_connections")
    .upsert(tokenDataToRow(tenantId, tokenData), { onConflict: "tenant_id,open_id" })
    .select("*")
    .single();
  if (error || !connection) {
    throw new Error(`No se pudo guardar la conexión de TikTok Shop: ${error?.message}`);
  }

  await refreshShopsList(connection.id, tokenData.access_token);

  return connection as TikTokShopConnection;
}

async function refreshShopsList(connectionId: string, accessToken: string): Promise<void> {
  const shops = await getAuthorizedShops(accessToken);
  for (const shop of shops) {
    await supabaseAdmin.from("tiktok_shop_shops").upsert(
      {
        connection_id: connectionId,
        shop_id: shop.id,
        shop_cipher: shop.cipher,
        shop_name: shop.name,
        region: shop.region,
        seller_type: shop.seller_type,
        shop_code: shop.code,
      },
      { onConflict: "connection_id,shop_id" }
    );
  }

  // Suscripción al aviso de cambio de estado de pedido — es lo que permite
  // la impresión automática por API (sin esto, solo se puede ver/imprimir a
  // mano desde Pedidos (API)). Es idempotente (volver a registrar la misma
  // URL no duplica nada), así que se repite en cada conexión/renovación sin
  // problema. Si falla (p. ej. en local, sin HTTPS pública), no debe romper
  // el resto de la conexión — se queda sin auto-impresión hasta que se
  // pueda registrar, pero conectar/ver pedidos sigue funcionando.
  try {
    await registerOrderStatusWebhook(accessToken, `${env.appUrl}/api/tiktok/webhooks`);
  } catch (err) {
    console.error("[TikTok Shop] No se pudo registrar el webhook de pedidos:", err);
  }
}

export async function getConnectionForTenant(tenantId: string): Promise<TikTokShopConnection | null> {
  const { data } = await supabaseAdmin
    .from("tiktok_shop_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as TikTokShopConnection) ?? null;
}

export async function getShopsForConnection(connectionId: string): Promise<TikTokShopRow[]> {
  const { data } = await supabaseAdmin
    .from("tiktok_shop_shops")
    .select("*")
    .eq("connection_id", connectionId)
    .order("created_at", { ascending: true });
  return (data as TikTokShopRow[]) ?? [];
}

/**
 * Devuelve un access_token válido para el tenant, renovándolo primero si
 * está a menos de 24h de caducar. Lanza si no hay ninguna conexión.
 */
export async function getValidAccessToken(tenantId: string): Promise<TikTokShopConnection> {
  const connection = await getConnectionForTenant(tenantId);
  if (!connection) throw new Error("Este tenant no tiene ninguna conexión con TikTok Shop.");

  const expiresAt = new Date(connection.access_token_expires_at).getTime();
  if (expiresAt - Date.now() > REFRESH_BUFFER_MS) return connection;

  const tokenData = await refreshAccessToken(connection.refresh_token);
  const { data: updated, error } = await supabaseAdmin
    .from("tiktok_shop_connections")
    .update(tokenDataToRow(tenantId, tokenData))
    .eq("id", connection.id)
    .select("*")
    .single();
  if (error || !updated) {
    throw new Error(`No se pudo renovar el token de TikTok Shop: ${error?.message}`);
  }

  await refreshShopsList(connection.id, tokenData.access_token);

  return updated as TikTokShopConnection;
}

export async function deleteConnection(tenantId: string): Promise<void> {
  await supabaseAdmin.from("tiktok_shop_connections").delete().eq("tenant_id", tenantId);
}
