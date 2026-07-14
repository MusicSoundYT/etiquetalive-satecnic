import { NextRequest, NextResponse } from "next/server";
import { peekPasswordResetToken } from "@/lib/auth/password-reset";
import { isRateLimited } from "@/lib/auth/rate-limit";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  if (isRateLimited(`reset-validate:${ip}`)) {
    return NextResponse.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429 });
  }

  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ valid: false });
  }

  const userId = await peekPasswordResetToken(token);
  return NextResponse.json({ valid: userId !== null });
}
