import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDefaultTemplate } from "@/lib/labels/get-default-template";
import { generateLabelHtml } from "@/lib/labels/render";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("tk, external_order_id, cliente, precio_cents, moneda, fecha_pedido, raw_payload, impresiones_cobrables")
    .eq("id", id)
    .eq("tenant_id", user.tenant_id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });

  // "Ver" (mode=view, o sin mode) siempre es una vista previa no válida para envío.
  // El render real (QR escaneable) solo se sirve en mode=print, y solo si el pedido
  // ya está marcado como cobrado (impresiones_cobrables > 0) — eso solo ocurre tras
  // pasar por /print o /reprint, que son los que gestionan el cobro. Así, abrir esta
  // URL directamente nunca permite saltarse el proceso de pago.
  const mode = req.nextUrl.searchParams.get("mode");
  const preview = mode !== "print" || !(order.impresiones_cobrables > 0);

  const template = await getDefaultTemplate(user.tenant_id);
  const html = await generateLabelHtml(order, template, { preview });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
