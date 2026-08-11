import { NextRequest, NextResponse } from "next/server";
import { requireCajaTikTokExportEnv } from "@/lib/env";
import { refreshCajaTikTokOrderStatus } from "@/lib/cajatiktok-export/refresh-order-status";

// Disparado cada 15-30 min por el crontab del VPS. Revisa contra TikTok los
// pedidos ya importados que todavía no están en un estado final, y
// actualiza estado_envio en Caja TikTok solo donde ha cambiado — la propia
// pantalla de Caja TikTok se refresca sola vía su suscripción realtime.
export async function GET(req: NextRequest) {
  const { cronSecret } = requireCajaTikTokExportEnv();
  const provided = req.nextUrl.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== cronSecret) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  try {
    const result = await refreshCajaTikTokOrderStatus();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Caja TikTok] Error refrescando estados:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
