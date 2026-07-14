import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { corsPreflight, withCors } from "@/lib/cors";
import { claimAndChargePrint } from "@/lib/orders/charge-print";
import { getDefaultTemplate } from "@/lib/labels/get-default-template";
import { generateLabelHtml } from "@/lib/labels/render";

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

const bodySchema = z.object({
  order_id: z.string().trim().min(1),
  cliente: z.string().trim().max(300).optional().default(""),
  precio: z.number().nonnegative().optional().default(0),
  moneda: z.string().trim().length(3).optional().default("EUR"),
  fecha_pedido: z.string().optional(),
  raw: z.string().optional(),
  detect_only: z.boolean().optional().default(false),
  // La extensión manda esto en true solo cuando el pedido cae dentro de una
  // sesión Live activa Y el ajuste "impresión automática" está encendido en
  // su copia local de la config — el servidor vuelve a comprobar el ajuste
  // real del tenant antes de cobrar, no se fía solo de este flag.
  auto_print_eligible: z.boolean().optional().default(false),
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
 * Registra el pedido y, si toca auto-imprimir (ver auto_print_eligible más
 * abajo), cobra la primera impresión igual que el botón manual y devuelve la
 * etiqueta lista para que la extensión la imprima sola.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const tenantId = await authenticateExtensionRequest(req, rawBody);
  if (!tenantId) return withCors(req, NextResponse.json({ error: "No autorizado." }, { status: 401 }));

  const parsed = bodySchema.safeParse(JSON.parse(rawBody || "{}"));
  if (!parsed.success) return withCors(req, NextResponse.json({ error: "Datos inválidos." }, { status: 400 }));
  const body = parsed.data;

  // Idempotencia: si ya existe un pedido con este external_order_id para el
  // tenant, no se duplica (reintentos de la extensión, varios dispositivos,
  // o el mismo pedido detectado más de una vez durante el directo).
  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("external_order_id", body.order_id)
    .maybeSingle();

  let order = existing;
  if (!order) {
    const { data: tk } = await supabaseAdmin.rpc("next_tk", { p_tenant_id: tenantId });

    const { data: created, error } = await supabaseAdmin
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
      .select("*")
      .single();

    if (error || !created) {
      return withCors(req, NextResponse.json({ error: "No se pudo registrar el pedido." }, { status: 500 }));
    }
    order = created;
  }

  if (body.detect_only || !body.auto_print_eligible) {
    return withCors(req, NextResponse.json({ tk: order.tk, order_id: order.id }));
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("auto_print_enabled")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant?.auto_print_enabled) {
    return withCors(req, NextResponse.json({ tk: order.tk, order_id: order.id }));
  }

  const result = await claimAndChargePrint(order, tenantId);

  if (result.status === "insufficient_balance") {
    return withCors(
      req,
      NextResponse.json({ tk: order.tk, order_id: order.id, error: "insufficient_balance" })
    );
  }
  if (result.status === "blocked" || result.status === "no_owner") {
    return withCors(req, NextResponse.json({ tk: order.tk, order_id: order.id, error: "blocked" }));
  }

  // charged | already_charged | demo: en los tres casos se sirve la etiqueta
  // real (la reimpresión, igual que en el botón manual, no vuelve a cobrar).
  const finalOrder = "order" in result ? result.order : order;
  const template = await getDefaultTemplate(tenantId);
  const labelHtml = await generateLabelHtml(finalOrder, template, { preview: false });

  return withCors(req, NextResponse.json({ tk: finalOrder.tk, order_id: finalOrder.id, label_html: labelHtml }));
}
