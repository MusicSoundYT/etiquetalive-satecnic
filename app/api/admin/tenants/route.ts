import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashPassword } from "@/lib/auth/password";
import { generateReferralCode } from "@/lib/referrals/code";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendWelcomeEmail } from "@/lib/mail/send-welcome-email";

/** Lista ligera de clientes (tenants) para el selector de filtro del panel de admin. */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id, business_name")
    .order("business_name", { ascending: true });

  if (error) return NextResponse.json({ error: "No se pudo cargar la lista." }, { status: 500 });
  return NextResponse.json({ tenants: data ?? [] });
}

const bodySchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(200),
  lastName: z.string().trim().max(200).optional(),
});

/**
 * Alta manual de un cliente por un administrador (sin pasar por el registro
 * público) — para clientes captados por otra vía. La contraseña se genera al
 * azar y nunca se comunica: el cliente la elige a través del mismo enlace de
 * un solo uso que usa "olvidé mi contraseña".
 */
export async function POST(req: NextRequest) {
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  const { businessName, email, name, lastName } = parsed.data;

  const { data: existing } = await supabaseAdmin.from("users").select("id").eq("email", email).maybeSingle();
  if (existing) return NextResponse.json({ error: "Ya existe una cuenta con ese email." }, { status: 400 });

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .insert({ business_name: businessName, billing_email: email })
    .select("id")
    .single();
  if (tenantError || !tenant) {
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }

  const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
  const myReferralCode = generateReferralCode();

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .insert({
      tenant_id: tenant.id,
      email,
      name,
      last_name: lastName ?? null,
      password_hash: passwordHash,
      role: "owner",
      my_referral_code: myReferralCode,
    })
    .select("id, email")
    .single();
  if (userError || !user) {
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }

  await supabaseAdmin.from("user_balances").insert({ user_id: user.id, current_tier: 1 });

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    admin_email: admin.email,
    action: "create_tenant",
    target_user_id: user.id,
    details: { tenant_id: tenant.id, business_name: businessName, email },
  });

  const token = await createPasswordResetToken(user.id, "admin_created");
  await sendWelcomeEmail(user.email, token);

  return NextResponse.json({ status: "ok", tenantId: tenant.id, userId: user.id });
}
