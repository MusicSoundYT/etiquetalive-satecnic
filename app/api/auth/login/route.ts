import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPassword } from "@/lib/auth/password";
import { isRateLimited } from "@/lib/auth/rate-limit";
import { issueMfaChallenge } from "@/lib/auth/mfa-challenge";
import { createSession } from "@/lib/auth/session";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

function clientIp(req: NextRequest): string {
  // Último salto = el que añade nuestro propio proxy (nginx); el primero
  // podría venir falsificado por el propio cliente.
  return req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
}

const GENERIC_ERROR = { error: "Email o contraseña incorrectos." } as const;

// Hash bcrypt fijo, sin relación con ninguna contraseña real: cuando el
// email no existe se compara igualmente contra él (y se descarta el
// resultado) para que el tiempo de respuesta sea el mismo que con un email
// registrado — si no, la ausencia del coste de bcrypt.compare() delataría
// por timing qué emails están dados de alta, incluso con un mensaje genérico.
const DUMMY_PASSWORD_HASH = "$2b$12$UB7ntIgK322xbfsKxq1YbOvwo8.fR1cFniKIkP7HlyxwTW6eo8STW";

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
    .select("id, tenant_id, password_hash, mfa_enabled, mfa_exempt")
    .eq("email", email)
    .maybeSingle();

  if (!user || !user.password_hash) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const validPassword = await verifyPassword(password, user.password_hash);
  if (!validPassword) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  if (user.tenant_id) {
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("status")
      .eq("id", user.tenant_id)
      .maybeSingle();
    if (tenant?.status && tenant.status !== "active") {
      return NextResponse.json(
        { error: "Esta cuenta está dada de baja. Contacta con soporte." },
        { status: 403 }
      );
    }
  }

  await supabaseAdmin
    .from("users")
    .update({ last_login_at: new Date().toISOString(), last_login_ip: ip })
    .eq("id", user.id);

  // Exención explícita de un administrador (petición expresa del cliente):
  // se salta el MFA por completo, incluso si el usuario ya lo tenía
  // configurado, y se abre sesión directamente.
  if (user.mfa_exempt) {
    await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") });
    return NextResponse.json({ status: "ok", mfaExempt: true });
  }

  await issueMfaChallenge(user.id);

  return NextResponse.json({ status: "ok", mfaEnrolled: user.mfa_enabled });
}
