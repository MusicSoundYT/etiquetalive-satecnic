import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Sustituye el "x-el-sign" legacy (hash de 32 bits + secreto placeholder nunca
 * sustituido) por un HMAC-SHA256 real usando la propia API key del tenant como
 * clave — solo quien conoce la key real puede generar una firma válida para
 * un body concreto.
 */
export function verifyRequestSignature(rawBody: string, signatureHeader: string | null, apiKey: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", apiKey).update(rawBody).digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
