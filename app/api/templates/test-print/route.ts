import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { templateFieldsSchema } from "@/lib/labels/schema";
import { generateLabelHtml } from "@/lib/labels/render";
import { buildTestSampleOrder } from "@/lib/labels/test-sample-order";
import type { LabelTemplate } from "@/lib/labels/types";

const bodySchema = z.object({ fields: templateFieldsSchema });

/**
 * Etiqueta de prueba para comprobar que la impresora imprime bien con la
 * configuración actual (guardada o no) de la plantilla — con datos de
 * ejemplo inventados, nunca de la base de datos, y en modo preview para que
 * el QR no sea válido y esto no pueda usarse como sustituto de una etiqueta
 * real pagada. La fecha/hora es siempre la actual en el momento de imprimir.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const template: LabelTemplate = {
    id: "test-print",
    tenant_id: "test-print",
    nombre: "test-print",
    is_default: false,
    ...parsed.data.fields,
  };

  const html = await generateLabelHtml(buildTestSampleOrder(), template, { preview: true });
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
