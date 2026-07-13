import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDefaultTemplate } from "@/lib/labels/get-default-template";
import { generateLabelHtml } from "@/lib/labels/render";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("tk, external_order_id, cliente, precio_cents, moneda, fecha_pedido, raw_payload")
    .eq("id", id)
    .eq("tenant_id", user.tenant_id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });

  const template = await getDefaultTemplate(user.tenant_id);
  const html = await generateLabelHtml(order, template);

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
