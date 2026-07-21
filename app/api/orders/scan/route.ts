import { NextRequest, NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { corsPreflight, withCors } from "@/lib/cors";
import { supabaseAdmin } from "@/lib/supabase-admin";

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * Log de diagnóstico: la extensión manda aquí cada barrido bruto de la página
 * de pedidos (antes de parsear pedidos concretos, que va por /api/v1/order/detect).
 * Se guarda en order_scan_log para poder ver qué vio realmente la extensión
 * ante un incidente en directo, sin tener que añadir console.log y pedir al
 * cliente que reinstale la extensión en pleno directo.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const tenantId = await authenticateExtensionRequest(req, rawBody);
  if (!tenantId) return withCors(req, NextResponse.json({ error: "No autorizado." }, { status: 401 }));

  const body = JSON.parse(rawBody || "{}");
  const cards = Array.isArray(body?.cards) ? body.cards : [];

  await supabaseAdmin.from("order_scan_log").insert({
    tenant_id: tenantId,
    captured_at: body?.capturedAt || new Date().toISOString(),
    reason: typeof body?.reason === "string" ? body.reason.slice(0, 200) : null,
    href: typeof body?.href === "string" ? body.href.slice(0, 2000) : null,
    card_count: cards.length,
    cards,
  });

  return withCors(req, NextResponse.json({ status: "ok" }));
}
