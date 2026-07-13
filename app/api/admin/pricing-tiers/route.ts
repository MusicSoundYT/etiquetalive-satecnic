import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const { data } = await supabaseAdmin.from("pricing_tiers").select("*").order("tier");
  return NextResponse.json({ tiers: data ?? [] });
}

const bodySchema = z.object({
  tier: z.number().int().min(1).max(3),
  priceCents: z.number().int().min(0),
  label: z.string().trim().min(1).max(60),
});

export async function PATCH(req: NextRequest) {
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("pricing_tiers")
    .update({ price_cents: parsed.data.priceCents, label: parsed.data.label })
    .eq("tier", parsed.data.tier);

  if (error) return NextResponse.json({ error: "No se pudo actualizar el rango." }, { status: 500 });

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    admin_email: admin.email,
    action: "update_pricing_tier",
    details: parsed.data,
  });

  return NextResponse.json({ status: "ok" });
}
