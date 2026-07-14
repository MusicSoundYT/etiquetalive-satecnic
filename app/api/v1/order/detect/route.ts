import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";

const bodySchema = z.object({
  order_id: z.string().trim().min(1),
  cliente: z.string().trim().max(300).optional().default(""),
  precio: z.number().nonnegative().optional().default(0),
  moneda: z.string().trim().length(3).optional().default("EUR"),
  fecha_pedido: z.string().optional(),
  raw: z.string().optional(),
  detect_only: z.boolean().optional().default(false),
});

/** Convierte "DD/MM/YYYY HH:mm[:ss]" (formato que manda la extensión) a ISO. */
function parseExtensionDate(value?: string): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, d, mo, y, h, mi, s] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h || 0), Number(mi || 0), Number(s || 0));
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Endpoint que llama la extensión de Chrome (content script `order-watcher.js`)
 * cada vez que detecta una venta en la página de pedidos de TikTok Seller.
 * Nota: no genera etiqueta ni cobra aquí — solo registra el pedido. La
 * impresión (con su cobro la primera vez) se hace desde el panel, igual que
 * cualquier otro pedido. Ver components/orders-table.tsx.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const tenantId = await authenticateExtensionRequest(req, rawBody);
  if (!tenantId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const parsed = bodySchema.safeParse(JSON.parse(rawBody || "{}"));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const body = parsed.data;

  // Idempotencia: si ya existe un pedido con este external_order_id para el
  // tenant, no se duplica (reintentos de la extensión, varios dispositivos,
  // o el mismo pedido detectado más de una vez durante el directo).
  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id, tk")
    .eq("tenant_id", tenantId)
    .eq("external_order_id", body.order_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ tk: existing.tk, order_id: existing.id });
  }

  const { data: tk } = await supabaseAdmin.rpc("next_tk", { p_tenant_id: tenantId });

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      tenant_id: tenantId,
      tk,
      external_order_id: body.order_id,
      cliente: body.cliente || null,
      precio_cents: Math.round(body.precio * 100),
      moneda: body.moneda,
      fecha_pedido: parseExtensionDate(body.fecha_pedido),
      raw_payload: body.raw ? { source: "chrome_extension", detect_only: body.detect_only, raw: body.raw } : null,
    })
    .select("id, tk")
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "No se pudo registrar el pedido." }, { status: 500 });
  }

  return NextResponse.json({ tk: order.tk, order_id: order.id });
}
