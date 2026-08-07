import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { saveConnectionFromAuthCode } from "@/lib/tiktok-shop/connection";

const STATE_COOKIE = "el_tiktok_oauth_state";

function redirectToAccount(status: string) {
  const url = new URL("/account", env.appUrl);
  url.searchParams.set("tiktok", status);
  return NextResponse.redirect(url);
}

/**
 * TikTok redirige aquí tras la autorización con ?code=...&state=.... La URL
 * es fija (configurada en el Partner Center), así que esta ruta debe
 * quedarse siempre en esta dirección exacta.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.redirect(new URL("/login", env.appUrl));

  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const deniedOrError = req.nextUrl.searchParams.get("error");

  if (deniedOrError || !code) return redirectToAccount("denied");
  if (!expectedState || state !== expectedState) return redirectToAccount("invalid_state");

  try {
    await saveConnectionFromAuthCode(user.tenant_id, code);
    return redirectToAccount("connected");
  } catch (err) {
    console.error("[TikTok Shop] Error al completar la autorización:", err);
    return redirectToAccount("error");
  }
}
