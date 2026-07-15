import "server-only";
import { randomInt, createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

export const EMAIL_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutos, por seguridad

export function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// HMAC en vez de un hash simple: aunque la BD quedara expuesta, sin
// SESSION_SECRET no se puede fuerza-brutear el espacio de 10^6 códigos.
function sign(code: string): string {
  return createHmac("sha256", env.sessionSecret).update(code).digest("base64url");
}

export function hashEmailCode(code: string): string {
  return sign(code);
}

export function verifyEmailCode(code: string, hash: string): boolean {
  const expected = sign(code);
  const a = Buffer.from(hash);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
