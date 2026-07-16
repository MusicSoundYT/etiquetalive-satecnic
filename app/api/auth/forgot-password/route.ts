import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/mail/send-reset-email";
import { isRateLimited } from "@/lib/auth/rate-limit";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email() });

function clientIp(req: NextRequest): string {
  // Último salto = el que añade nuestro propio proxy (nginx); el primero
  // podría venir falsificado por el propio cliente.
  return req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
}

const GENERIC_RESPONSE = { status: "ok", message: "Si el email existe, te hemos enviado instrucciones." };

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(GENERIC_RESPONSE);

  if (isRateLimited(`forgot:${ip}`) || isRateLimited(`forgot:${parsed.data.email}`)) {
    return NextResponse.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429 });
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, email")
    .eq("email", parsed.data.email)
    .maybeSingle();

  // Respuesta siempre genérica: no confirma ni niega si el email existe.
  if (user) {
    const token = await createPasswordResetToken(user.id, ip);
    await sendPasswordResetEmail(user.email, token);
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
