import "server-only";
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key-auth";
import { verifyRequestSignature } from "@/lib/auth/verify-signature";

/**
 * Autentica una petición de la extensión Chrome: cabecera `x-api-key` +
 * `x-el-sign` (HMAC-SHA256 del body en crudo, firmado con la propia key).
 * `rawBody` debe ser exactamente el string que el cliente firmó (para GET sin
 * cuerpo, la extensión firma el literal "{}").
 */
export async function authenticateExtensionRequest(
  req: NextRequest,
  rawBody: string
): Promise<string | null> {
  const apiKey = req.headers.get("x-api-key") ?? "";
  if (!apiKey) return null;
  const signature = req.headers.get("x-el-sign");
  if (!verifyRequestSignature(rawBody, signature, apiKey)) return null;
  return validateApiKey(req);
}
