import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth/session";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  lastName: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().email(),
});

export async function PATCH(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const { name, lastName, email } = parsed.data;

  if (email !== sessionUser.email) {
    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email)
      .neq("id", sessionUser.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Ese email ya está en uso." }, { status: 400 });
    }
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({ name, last_name: lastName ?? null, email })
    .eq("id", sessionUser.id);

  if (error) {
    return NextResponse.json({ error: "No se pudo actualizar el perfil." }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
