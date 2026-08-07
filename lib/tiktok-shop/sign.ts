import "server-only";
import { createHmac } from "crypto";

/**
 * Firma de peticiones a la API de TikTok Shop (HMAC-SHA256, hex).
 * Algoritmo exacto documentado por TikTok: los parámetros de query (sin
 * "sign" ni "access_token") se ordenan alfabéticamente y se concatenan como
 * clave+valor sin separadores; se antepone la ruta; si hay cuerpo (y no es
 * multipart/form-data) se añade tal cual, sin volver a serializarlo — un
 * cambio de espacios/orden en el JSON invalidaría la firma. Todo eso se
 * envuelve entre app_secret y se firma con app_secret como clave HMAC.
 */
export function signTikTokRequest(params: {
  path: string;
  query: Record<string, string>;
  body?: string;
  appSecret: string;
}): string {
  const { path, query, body, appSecret } = params;
  const sortedKeys = Object.keys(query)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  const paramsStr = sortedKeys.map((k) => `${k}${query[k]}`).join("");
  const base = path + paramsStr + (body ?? "");
  const wrapped = appSecret + base + appSecret;
  return createHmac("sha256", appSecret).update(wrapped).digest("hex");
}
