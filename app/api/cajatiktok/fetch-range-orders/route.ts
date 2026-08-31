import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { verifyCronSecret } from "@/lib/auth/verify-cron-secret";
import { fetchAuctionOrdersForRange } from "@/lib/cajatiktok-export/export-daily-auction-orders";
import { findByGrupoNombre } from "@/lib/cajatiktok-export/tenant";

// Llamado por la Edge Function "tiktok-bridge" de Caja TikTok (nunca
// directamente desde su navegador) cuando alguien usa "Actualizar por API"
// sobre una importación YA activa. A diferencia de /import-range, este
// endpoint es de SOLO LECTURA — no crea ni toca nada en la base de datos de
// Caja TikTok, solo devuelve los pedidos del rango tal cual están en
// nuestra tabla "orders". Es Caja TikTok quien decide, con esos datos en
// bruto, cómo fusionarlos con la importación activa (mismo camino que
// re-subir un Excel, ver excel.js -> buildImportFromRows).
export async function POST(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  if (!verifyCronSecret(req, cronSecret)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { startUtc?: string; endUtc?: string; grupoNombre?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }
  if (!body.startUtc || !body.endUtc) {
    return NextResponse.json({ error: "Faltan startUtc/endUtc." }, { status: 400 });
  }
  const pair = body.grupoNombre ? findByGrupoNombre(body.grupoNombre) : undefined;
  if (!pair) {
    return NextResponse.json({ error: `No hay ningún cliente configurado para el grupo "${body.grupoNombre}".` }, { status: 400 });
  }

  try {
    const { orders } = await fetchAuctionOrdersForRange(pair, body.startUtc, body.endUtc);
    return NextResponse.json({
      orders: orders.map((o) => ({
        external_order_id: o.external_order_id,
        cliente: o.cliente,
        precio_cents: o.precio_cents,
        fecha_pedido: o.fecha_pedido,
        productName: o.productName,
        // Identificador interno de TikTok para el comprador, nunca
        // enmascarado — ver fetchAuctionOrdersForRange.
        userId: o.userId,
      })),
    });
  } catch (err) {
    console.error("[Caja TikTok] Error trayendo pedidos del rango:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
