import "server-only";
import { requireTikTokShopEnv } from "@/lib/env";

const AUTH_BASE = "https://auth.tiktok-shops.com";

export type TikTokTokenData = {
  access_token: string;
  access_token_expire_in: number; // timestamp Unix absoluto, no una duración (naming engañoso de TikTok)
  refresh_token: string;
  refresh_token_expire_in: number; // también absoluto
  open_id: string;
  seller_name: string;
  seller_base_region: string;
  user_type: number;
  granted_scopes: string[];
};

async function callAuthEndpoint(
  path: string,
  extraParams: Record<string, string>
): Promise<TikTokTokenData> {
  const { appKey, appSecret } = requireTikTokShopEnv();
  const url = new URL(AUTH_BASE + path);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("app_secret", appSecret);
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`TikTok Shop auth (${path}) falló: ${json.message ?? "sin mensaje"} (code ${json.code})`);
  }
  return json.data as TikTokTokenData;
}

/**
 * Cambia el "code" recibido en el callback de autorización por el par de
 * tokens. OJO: grant_type debe ser literalmente "authorized_code" — así lo
 * llama la documentación de TikTok, NO es el "authorization_code" estándar
 * de OAuth. El auth_code caduca a los 30 minutos y es de un solo uso.
 */
export async function exchangeAuthCode(authCode: string): Promise<TikTokTokenData> {
  return callAuthEndpoint("/api/v2/token/get", {
    auth_code: authCode,
    grant_type: "authorized_code",
  });
}

/**
 * Pide un access_token nuevo usando el refresh_token. El access_token dura
 * 7 días; el refresh_token dura lo que el vendedor eligió al autorizar (no
 * es un valor fijo), así que su fecha de caducidad se guarda y se vigila
 * por conexión en vez de asumir una duración constante.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TikTokTokenData> {
  return callAuthEndpoint("/api/v2/token/refresh", {
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}
