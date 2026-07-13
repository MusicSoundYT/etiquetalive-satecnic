import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword, validatePasswordPolicy, PASSWORD_POLICY_MESSAGE } from "@/lib/auth/password";
import { isRateLimited } from "@/lib/auth/rate-limit";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  if (isRateLimited(`change-password:${user.id}`)) {
    return NextResponse.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  if (!validatePasswordPolicy(parsed.data.newPassword)) {
    return NextResponse.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 });
  }

  const { data: dbUser } = await supabaseAdmin
    .from("users")
    .select("password_hash")
    .eq("id", user.id)
    .maybeSingle();

  if (!dbUser?.password_hash || !(await verifyPassword(parsed.data.currentPassword, dbUser.password_hash))) {
    return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 401 });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const { error } = await supabaseAdmin.from("users").update({ password_hash: passwordHash }).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: "No se pudo actualizar la contraseña." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
