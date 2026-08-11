import "server-only";
import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

/**
 * Comparación a tiempo constante del CRON_SECRET, solo por cabecera
 * (Authorization: Bearer ...) — igual que ya se hace con la firma del
 * webhook de TikTok, en vez de "!==" directo, que sí puede filtrar
 * información por el tiempo de respuesta byte a byte.
 *
 * A propósito, ya NO se acepta por ?secret= en la URL: un proxy delante de
 * la app (nginx, etc.) suele registrar la URL completa en sus logs de
 * acceso, así que el secreto podría acabar duplicado en sitios que no
 * controlamos — por cabecera, no.
 */
export function verifyCronSecret(req: NextRequest, expectedSecret: string): boolean {
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expectedSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}
