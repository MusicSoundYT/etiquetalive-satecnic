import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPassword } from "@/lib/auth/password";
import { isRateLimited } from "@/lib/auth/rate-limit";
import { issueMfaChallenge } from "@/lib/auth/mfa-challenge";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const GENERIC_ERROR = { error: "Email o contraseña incorrectos." } as const;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }
  const { email, password } = parsed.data;

  if (isRateLimited(`login:${ip}`) || isRateLimited(`login:${email}`)) {
    return NextResponse.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429 });
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, password_hash, mfa_enabled")
    .eq("email", email)
    .maybeSingle();

  if (!user || !user.password_hash) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const validPassword = await verifyPassword(password, user.password_hash);
  if (!validPassword) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  await supabaseAdmin
    .from("users")
    .update({ last_login_at: new Date().toISOString(), last_login_ip: ip })
    .eq("id", user.id);

  await issueMfaChallenge(user.id);

  return NextResponse.json({ status: "ok", mfaEnrolled: user.mfa_enabled });
}
