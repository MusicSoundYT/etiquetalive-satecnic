import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({ notes: z.string().trim().max(2000).optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data: updated, error } = await supabaseAdmin
    .from("orders")
    .update({ notes: parsed.data.notes || null })
    .eq("id", id)
    .eq("tenant_id", user.tenant_id)
    .select("id, notes")
    .maybeSingle();

  if (error || !updated) return NextResponse.json({ error: "No se pudo guardar la nota." }, { status: 404 });

  return NextResponse.json({ order: updated });
}
