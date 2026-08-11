import "server-only";
import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

/**
 * Comparación a tiempo constante del CRON_SECRET (acepta ?secret=... o
 * Authorization: Bearer ...) — igual que ya se hace con la firma del
 * webhook de TikTok, en vez de "!==" directo, que sí puede filtrar
 * información por el tiempo de respuesta byte a byte.
 */
export function verifyCronSecret(req: NextRequest, expectedSecret: string): boolean {
  const provided = req.nextUrl.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expectedSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}
