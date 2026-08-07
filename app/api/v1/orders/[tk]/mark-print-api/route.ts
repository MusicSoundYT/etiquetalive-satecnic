import { NextRequest, NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { corsPreflight, withCors } from "@/lib/cors";
import { supabaseAdmin } from "@/lib/supabase-admin";

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * La extensión avisa aquí justo antes de invocar window.print() en un flujo
 * de auto-impresión. No afecta al cobro (eso se gestiona en
 * /api/orders/[id]/print y /reprint) — pero sí marca label_delivered_at
 * (primera vez que este pedido se le entrega de verdad a una impresora), lo
 * que evita que el mismo pedido se vuelva a imprimir por el sondeo de
 * Pedidos (API) si el aviso automático por webhook lo cobró primero.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tk: string }> }) {
  const { tk } = await params;
  const rawBody = await req.text();
  const tenantId = await authenticateExtensionRequest(req, rawBody);
  if (!tenantId) return withCors(req, NextResponse.json({ error: "No autorizado." }, { status: 401 }));

  supabaseAdmin
    .from("orders")
    .update({ label_delivered_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("tk", tk)
    .is("label_delivered_at", null)
    .then(() => {}, () => {});

  return withCors(req, NextResponse.json({ status: "ok" }));
}
