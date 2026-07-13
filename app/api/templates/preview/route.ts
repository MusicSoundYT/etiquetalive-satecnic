import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { templateFieldsSchema } from "@/lib/labels/schema";
import { generateLabelHtml } from "@/lib/labels/render";
import type { LabelTemplate } from "@/lib/labels/types";

const SAMPLE_ORDER = {
  tk: "TK-00001",
  external_order_id: "987654321012",
  cliente: "María López",
  precio_cents: 400,
  moneda: "EUR",
  fecha_pedido: new Date().toISOString(),
  raw_payload: { tiktok_name: "silvy_883" },
};

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = templateFieldsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const fakeTemplate: LabelTemplate = {
    id: "preview",
    tenant_id: "preview",
    nombre: "preview",
    is_default: false,
    ...parsed.data,
  };

  const html = await generateLabelHtml(SAMPLE_ORDER, fakeTemplate);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
