import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveTenantContext } from "@/lib/auth/tenant-context";
import { verifyRequestSignature } from "@/lib/auth/verify-signature";

const bodySchema = z.object({
  externalOrderId: z.string().trim().min(1).optional(),
  cliente: z.string().trim().max(300).optional(),
  precioCents: z.number().int().nonnegative().optional(),
  moneda: z.string().trim().length(3).default("EUR"),
  fechaPedido: z.string().datetime().optional(),
  raw: z.unknown().optional(),
});

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const ctx = await resolveTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  // Si viene autenticado por API key (extensión, no sesión de dashboard), exigir
  // además una firma HMAC válida del body — ver lib/auth/verify-signature.ts.
  if (!ctx.userId) {
    const apiKey = req.headers.get("x-api-key") ?? "";
    const signature = req.headers.get("x-el-sign");
    if (!verifyRequestSignature(rawBody, signature, apiKey)) {
      return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
    }
  }

  const parsed = bodySchema.safeParse(JSON.parse(rawBody || "{}"));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data: tk } = await supabaseAdmin.rpc("next_tk", { p_tenant_id: ctx.tenantId });

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      tenant_id: ctx.tenantId,
      tk,
      external_order_id: parsed.data.externalOrderId ?? null,
      cliente: parsed.data.cliente ?? null,
      precio_cents: parsed.data.precioCents ?? 0,
      moneda: parsed.data.moneda,
      fecha_pedido: parsed.data.fechaPedido ?? null,
      raw_payload: parsed.data.raw ?? null,
    })
    .select("*")
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "No se pudo registrar el pedido." }, { status: 500 });
  }

  return NextResponse.json({ order });
}
