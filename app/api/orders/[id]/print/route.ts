import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveTenantContext } from "@/lib/auth/tenant-context";
import { claimAndChargePrint } from "@/lib/orders/charge-print";
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
    .select("*")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });

  const result = await claimAndChargePrint(order, ctx.tenantId);

  switch (result.status) {
    case "blocked":
      return NextResponse.json({ error: result.reason }, { status: 402 });
    case "insufficient_balance":
      return NextResponse.json(
        { error: "Saldo insuficiente. Recarga tu saldo para poder imprimir." },
        { status: 402 }
      );
    case "no_owner":
      return NextResponse.json({ error: "Tenant sin usuario asociado." }, { status: 500 });
    case "already_charged":
      return NextResponse.json({ order, charged: false, reason: "already_charged_first_print" });
    case "demo":
      return NextResponse.json({ order: result.order, charged: false, reason: "demo_account", priceCents: 0 });
    case "charged":
      return NextResponse.json({ order: result.order, charged: true, priceCents: result.priceCents });
  }
}
