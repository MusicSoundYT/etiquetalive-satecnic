import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const CHALLENGE_COOKIE = "el_mfa_challenge";
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutos para completar el TOTP

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
}

/** Emite un reto de MFA de corta duración tras validar la contraseña, antes de abrir sesión completa. */
export async function issueMfaChallenge(userId: string): Promise<void> {
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const payload = `${userId}.${exp}`;
  const token = `${payload}.${sign(payload)}`;

  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(exp),
  });
}

/** Consume (y borra) el reto de MFA vigente; devuelve el userId si es válido. */
export async function consumeMfaChallenge(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, signature] = parts;
  const payload = `${userId}.${expStr}`;
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Date.now() > Number(expStr)) return null;

  jar.delete(CHALLENGE_COOKIE);
  return userId;
}
