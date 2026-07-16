import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { templateFieldsSchema } from "@/lib/labels/schema";
import { generateLabelHtml } from "@/lib/labels/render";
import { buildTestSampleOrder } from "@/lib/labels/test-sample-order";
import type { LabelTemplate } from "@/lib/labels/types";

// Todos los campos de la plantilla que son una medida física (mm o pt), tal
// como se ven en components/template-designer.tsx.
const SCALABLE_FIELDS = [
  "label_width_mm",
  "label_height_mm",
  "auction_font_pt",
  "customer_font_pt",
  "tiktok_font_pt",
  "order_font_pt",
  "price_font_pt",
  "date_font_pt",
  "label_font_pt",
  "qr_size_mm",
  "line_spacing_mm",
  "title_data_gap_mm",
  "letter_spacing_pt",
  "label_col_width_mm",
  "column_gap_mm",
  "padding_mm",
] as const;

const bodySchema = z.object({
  fields: templateFieldsSchema,
  // Factor de escala puramente visual para la vista previa (para que se vea a
  // un tamaño razonable en pantalla) — nunca se guarda, solo agranda/reduce
  // proporcionalmente TODAS las medidas para que la vista previa mantenga
  // exactamente la misma proporción que la etiqueta real impresa.
  previewScale: z.number().positive().max(20).optional().default(1),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const rawBody = await req.json().catch(() => null);
  // Compatibilidad: si llega el objeto de campos plano (sin envolver en
  // {fields, previewScale}), se trata como fields con escala 1.
  const parsed = bodySchema.safeParse(
    rawBody && "fields" in (rawBody as object) ? rawBody : { fields: rawBody }
  );
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { fields, previewScale } = parsed.data;
  const scaledFields = { ...fields };
  for (const key of SCALABLE_FIELDS) {
    scaledFields[key] = fields[key] * previewScale;
  }

  const fakeTemplate: LabelTemplate = {
    id: "preview",
    tenant_id: "preview",
    nombre: "preview",
    is_default: false,
    ...scaledFields,
  };

  const html = await generateLabelHtml(buildTestSampleOrder(), fakeTemplate);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
