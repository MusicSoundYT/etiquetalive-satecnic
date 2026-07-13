import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/account/:path*",
    "/mfa/:path*",
    "/orders/:path*",
    "/templates/:path*",
  ],
};

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("el_session");
  const hasMfaChallenge = req.cookies.has("el_mfa_challenge");

  if (pathname.startsWith("/mfa")) {
    if (!hasMfaChallenge && !hasSession) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // /dashboard, /admin, /account: exigen sesión completa (implica MFA ya superada,
  // porque la sesión solo se crea tras validar el TOTP — ver lib/auth/session.ts).
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}
