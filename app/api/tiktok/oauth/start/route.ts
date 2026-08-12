import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getAppCredentialsForTenant } from "@/lib/tiktok-shop/app-credentials";

const STATE_COOKIE = "el_tiktok_oauth_state";
// URL de autorización para vendedores fuera de EE. UU. (services.tiktokshop.com,
// sin el subdominio ".us."). No lleva redirect_uri: esa URL se configura de
// forma fija en el Partner Center, no se puede variar por petición.
const AUTHORIZE_URL = "https://services.tiktokshop.com/open/authorize";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.redirect(new URL("/login", env.appUrl));

  let serviceId: string;
  try {
    ({ serviceId } = await getAppCredentialsForTenant(user.tenant_id));
  } catch {
    const url = new URL("/account", env.appUrl);
    url.searchParams.set("tiktok", "missing_app_credentials");
    return NextResponse.redirect(url);
  }

  const state = randomBytes(24).toString("base64url");

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("service_id", serviceId);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
