import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDefaultTemplate } from "@/lib/labels/get-default-template";
import { generateLabelHtml } from "@/lib/labels/render";

const MAX_PER_POLL = 5;

/**
 * Consultado cada pocos segundos por la pestaña de Pedidos (API): devuelve
 * pedidos ya cobrados (impresiones_cobrables > 0) que todavía no se le han
 * entregado a ninguna impresora (label_delivered_at IS NULL) — vengan de
 * donde vengan (extensión o webhook automático). El reclamo es atómico
 * (UPDATE ... WHERE label_delivered_at IS NULL): si la extensión y este
 * sondeo compiten por el mismo pedido, solo uno de los dos se lo lleva,
 * nunca los dos — así esta vía también sirve de red de seguridad si la
 * extensión cobra un pedido pero falla al imprimirlo.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: candidates } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("tenant_id", user.tenant_id)
    .gt("impresiones_cobrables", 0)
    .is("label_delivered_at", null)
    .order("fecha_detectado", { ascending: true })
    .limit(MAX_PER_POLL);

  if (!candidates?.length) return NextResponse.json({ orders: [] });

  const template = await getDefaultTemplate(user.tenant_id);
  const results: { id: string; tk: string; label_html: string }[] = [];

  for (const candidate of candidates) {
    const { data: claimed } = await supabaseAdmin
      .from("orders")
      .update({ label_delivered_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .is("label_delivered_at", null)
      .select("*")
      .maybeSingle();
    if (!claimed) continue; // otra pestaña (o la extensión) se lo llevó primero

    const html = await generateLabelHtml(claimed, template, { preview: false });
    results.push({ id: claimed.id, tk: claimed.tk, label_html: html });
  }

  return NextResponse.json({ orders: results });
}
