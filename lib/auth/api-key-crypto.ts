import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { env } from "@/lib/env";

// Clave derivada de SESSION_SECRET (evita tener que añadir una variable de
// entorno nueva). El salt es fijo y específico de este uso para no reutilizar
// la misma clave derivada en otro contexto de la app.
const ENCRYPTION_KEY = scryptSync(env.sessionSecret, "el_api_key_enc_v1", 32);

/**
 * Cifrado reversible (AES-256-GCM) de la API key en claro, para poder
 * mostrarla de nuevo bajo petición del propio tenant autenticado. No sustituye
 * a key_hash/bcrypt_hash (que siguen siendo lo que se usa para verificar la
 * clave en cada petición de la extensión), es un campo adicional solo de
 * lectura para el "Ver clave" del portal.
 */
export function encryptApiKey(plainKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plainKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptApiKey(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
