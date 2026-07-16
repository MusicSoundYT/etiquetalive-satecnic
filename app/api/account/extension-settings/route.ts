import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({
  autoPrintEnabled: z.boolean(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("tenants")
    .select("auto_print_enabled")
    .eq("id", user.tenant_id)
    .maybeSingle();

  return NextResponse.json({
    autoPrintEnabled: data?.auto_print_enabled ?? true,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({ auto_print_enabled: parsed.data.autoPrintEnabled })
    .eq("id", user.tenant_id);

  if (error) return NextResponse.json({ error: "No se pudo guardar la configuración." }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
