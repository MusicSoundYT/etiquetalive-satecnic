import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({ enabled: z.boolean() });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  if (parsed.data.enabled) {
    const { data: balance } = await supabaseAdmin
      .from("user_balances")
      .select("stripe_default_pm_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!balance?.stripe_default_pm_id) {
      return NextResponse.json(
        { error: "Guarda una tarjeta antes de activar la autorecarga." },
        { status: 400 }
      );
    }
  }

  await supabaseAdmin
    .from("user_balances")
    .update({ auto_recharge_enabled: parsed.data.enabled })
    .eq("user_id", user.id);

  return NextResponse.json({ status: "ok" });
}
