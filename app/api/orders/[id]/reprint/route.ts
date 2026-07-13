import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveTenantContext } from "@/lib/auth/tenant-context";
import { verifyRequestSignature } from "@/lib/auth/verify-signature";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawBody = await req.text();
  const ctx = await resolveTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  if (!ctx.userId) {
    const apiKey = req.headers.get("x-api-key") ?? "";
    const signature = req.headers.get("x-el-sign");
    if (!verifyRequestSignature(rawBody, signature, apiKey)) {
      return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
    }
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, reimpresiones")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });

  // Nunca cobra: solo incrementa el contador de reimpresiones.
  const { data: updated, error } = await supabaseAdmin
    .from("orders")
    .update({
      reimpresiones: order.reimpresiones + 1,
      estado_impresion: "reimpreso",
      fecha_impresion: new Date().toISOString(),
    })
    .eq("id", order.id)
    .select("*")
    .single();

  if (error || !updated) return NextResponse.json({ error: "No se pudo reimprimir." }, { status: 500 });

  return NextResponse.json({ order: updated, charged: false });
}
