import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";

const eventSchema = z.object({
  winner: z.string().trim().max(200).optional().default(""),
  productName: z.string().trim().max(300).optional().default(""),
  price: z.string().trim().max(60).optional().default(""),
  auctionId: z.string().trim().max(60).optional().default(""),
  raw: z.string().optional(),
  pageUrl: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(80).optional(),
  detectedAt: z.string().optional(),
});

const bodySchema = z.object({
  event: eventSchema,
});

/** "price_value" en la tabla es el importe en euros (numeric), no céntimos. */
function parsePriceValue(priceText: string): number | null {
  const m = priceText.match(/(\d{1,6}(?:[,.]\d{1,2})?)/);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/** Ganador de subasta detectado por la extensión en el directo de TikTok. Solo registro/dedup. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const tenantId = await authenticateExtensionRequest(req, rawBody);
  if (!tenantId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const parsed = bodySchema.safeParse(JSON.parse(rawBody || "{}"));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const { event } = parsed.data;

  const signature = [event.winner, event.productName, event.price, event.auctionId]
    .join("|")
    .toLowerCase();

  const { data: dup } = await supabaseAdmin
    .from("auction_events_v2")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("signature", signature)
    .order("detected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabaseAdmin.from("auction_events_v2").insert({
    tenant_id: tenantId,
    winner: event.winner || null,
    product_name: event.productName || null,
    price_text: event.price || null,
    price_value: parsePriceValue(event.price),
    auction_id: event.auctionId || null,
    signature,
    is_duplicate: Boolean(dup),
    duplicate_of: dup?.id ?? null,
    page_url: event.pageUrl ?? null,
    capture_source: event.source ?? null,
    html_fragment_size: event.raw?.length ?? null,
  });

  return NextResponse.json({ status: "ok" });
}
