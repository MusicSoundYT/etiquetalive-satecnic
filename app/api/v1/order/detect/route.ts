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

/**
 * Convierte una fecha/hora de pared en Europe/Madrid (donde opera el
 * vendedor) al instante UTC real que le corresponde, teniendo en cuenta el
 * horario de verano/invierno. `new Date(y, mo, d, h, mi, s)` interpreta esos
 * números en la zona horaria del propio servidor (aquí, UTC) — eso hacía que
 * "20:25" (hora de Madrid) se guardara como 20:25 UTC, es decir 22:25 de
 * Madrid: 2 horas por delante de la hora real del pedido, visto en
 * producción en las etiquetas impresas.
 */
function madridWallTimeToUtcISOString(y: number, monthIndex: number, d: number, h: number, mi: number, s: number): string {
  const guessUtcMs = Date.UTC(y, monthIndex, d, h, mi, s);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(new Date(guessUtcMs))
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const madridAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offsetMs = madridAsUtcMs - guessUtcMs;
  return new Date(guessUtcMs - offsetMs).toISOString();
}

/** Convierte "DD/MM/YYYY HH:mm[:ss]" (formato que manda la extensión, hora de Madrid) a ISO UTC. */
function parseExtensionDate(value?: string): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, d, mo, y, h, mi, s] = m;
    try {
      return madridWallTimeToUtcISOString(Number(y), Number(mo) - 1, Number(d), Number(h || 0), Number(mi || 0), Number(s || 0));
    } catch {
      return null;
    }
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Al recargar seller-es.tiktok.com, TikTok sigue mostrando pedidos de horas
// atrás — no tiene sentido dar de alta un pedido "nuevo" tan viejo (ya se
// habrá gestionado o ya no forma parte del directo en curso).
const MAX_ORDER_AGE_MS = 4 * 60 * 60 * 1000;

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
  let fechaPedido = parseExtensionDate(body.fecha_pedido);

  // Red de seguridad: una fecha de pedido nunca puede ser del futuro (más
  // allá de un pequeño margen por desajuste de reloj) ni de hace muchísimo
  // tiempo. Visto en producción: un fallo de scrapeo en la extensión
  // enganchaba por error un "Plazo de entrega" (fecha límite de envío) en
  // vez de la fecha real del pedido, guardando pedidos con fecha varios días
  // en el futuro. Se corrige en el origen (ver order-watcher.js), pero esta
  // comprobación se mantiene aquí como respaldo ante cualquier otra fuente
  // de fecha mal formada, presente o futura.
  if (fechaPedido) {
    const deltaMs = new Date(fechaPedido).getTime() - Date.now();
    const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
    const MAX_PAST_MS = 30 * 24 * 60 * 60 * 1000;
    if (deltaMs > FUTURE_TOLERANCE_MS || deltaMs < -MAX_PAST_MS) {
      fechaPedido = null;
    }
  }

  if (!order) {
    // Al recargar seller-es.tiktok.com, TikTok sigue mostrando pedidos de
    // horas atrás — si el scrapeo trae una fecha y es más vieja que el
    // margen, no lo damos de alta como pedido "nuevo".
    if (fechaPedido && Date.now() - new Date(fechaPedido).getTime() > MAX_ORDER_AGE_MS) {
      return withCors(req, NextResponse.json({ skipped: "too_old" }));
    }

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
        fecha_pedido: fechaPedido,
        raw_payload: body.raw ? { source: "chrome_extension", detect_only: body.detect_only, raw: body.raw } : null,
      })
      .select("*")
      .single();

    if (error || !created) {
      return withCors(req, NextResponse.json({ error: "No se pudo registrar el pedido." }, { status: 500 }));
    }
    order = created;
  } else {
    // Reconciliación: un pedido ya detectado puede haberse guardado con
    // datos incompletos (p. ej. precio 0€ porque el scrapeo de esa pasada no
    // encontró el precio en el DOM). Si un nuevo escaneo trae un valor
    // válido y distinto del guardado, se corrige — pero nunca se sobreescribe
    // un dato bueno con uno vacío/cero, para no perder información por un
    // escaneo posterior parcial.
    const updates: Record<string, unknown> = {};
    const newPrecioCents = Math.round(body.precio * 100);
    if (newPrecioCents > 0 && newPrecioCents !== order.precio_cents) updates.precio_cents = newPrecioCents;
    if (body.cliente && body.cliente !== order.cliente) updates.cliente = body.cliente;
    if (fechaPedido && fechaPedido !== order.fecha_pedido) updates.fecha_pedido = fechaPedido;

    if (Object.keys(updates).length > 0) {
      const { data: updated } = await supabaseAdmin
        .from("orders")
        .update(updates)
        .eq("id", order.id)
        .select("*")
        .maybeSingle();
      if (updated) order = updated;
    }
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
  if (result.status === "already_charged") {
    // Esta misma auto-detección ya cobró e imprimió este pedido antes (dos
    // pestañas abiertas, o el mismo pedido detectado dos veces seguidas) —
    // no se vuelve a generar ni a devolver la etiqueta, para que la
    // extensión no imprima el mismo pedido dos veces sin que el usuario lo
    // pida explícitamente (eso sí sigue disponible como "Reimprimir" manual).
    return withCors(req, NextResponse.json({ tk: order.tk, order_id: order.id }));
  }

  // charged | demo: se sirve la etiqueta real recién cobrada.
  const finalOrder = "order" in result ? result.order : order;
  const template = await getDefaultTemplate(tenantId);
  // inlineScript: false — este HTML lo abre la extensión con window.open() +
  // document.write() desde un content script, donde Chrome bloquea el
  // <script> embebido por la CSP de la propia extensión (ver comentario en
  // generateLabelHtml). La extensión ya hace el autofit y el bloqueo de
  // clic derecho por su cuenta antes de imprimir.
  const labelHtml = await generateLabelHtml(finalOrder, template, { preview: false, inlineScript: false });

  return withCors(req, NextResponse.json({ tk: finalOrder.tk, order_id: finalOrder.id, label_html: labelHtml }));
}
