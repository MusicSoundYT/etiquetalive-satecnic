import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashPassword, validatePasswordPolicy, PASSWORD_POLICY_MESSAGE } from "@/lib/auth/password";
import { generateReferralCode } from "@/lib/referrals/code";
import { isRateLimited } from "@/lib/auth/rate-limit";
import { issueMfaChallenge } from "@/lib/auth/mfa-challenge";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  lastName: z.string().trim().max(200).optional(),
  referralCode: z.string().trim().toUpperCase().max(16).optional(),
});

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isRateLimited(`register:${ip}`)) {
    return NextResponse.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const { email, password, name, lastName, referralCode } = parsed.data;

  if (!validatePasswordPolicy(password)) {
    return NextResponse.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    // Respuesta genérica para no confirmar/negar la existencia del email de forma explícita
    return NextResponse.json(
      { error: "No se ha podido completar el registro con esos datos." },
      { status: 400 }
    );
  }

  let referrer: { id: string } | null = null;
  if (referralCode) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("my_referral_code", referralCode)
      .maybeSingle();
    referrer = data ?? null;
  }

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .insert({ business_name: name, billing_email: email })
    .select("id")
    .single();
  if (tenantError || !tenant) {
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }

  const passwordHash = await hashPassword(password);
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
    .select("id")
    .single();

  if (userError || !user) {
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }

  await supabaseAdmin.from("user_balances").insert({ user_id: user.id, current_tier: 1 });

  if (referrer) {
    await supabaseAdmin.from("referrals").insert({
      referrer_user_id: referrer.id,
      referred_user_id: user.id,
      referral_code: referralCode,
      status: "pending",
    });
  }

  await issueMfaChallenge(user.id);

  return NextResponse.json({ status: "ok", mfaEnrolled: false });
}
