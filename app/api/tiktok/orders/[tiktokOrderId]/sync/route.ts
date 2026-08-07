import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { ensureLocalOrder } from "@/lib/tiktok-shop/auction-orders";

/**
 * Da de alta (si hace falta) el pedido en nuestra tabla "orders" para poder
 * reutilizar el mismo flujo de imprimir/cobrar y notas que el Dashboard.
 * Idempotente: si ya existía (detectado antes por la extensión, o
 * sincronizado antes desde aquí), simplemente devuelve el mismo id.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tiktokOrderId: string }> }) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { tiktokOrderId } = await params;

  try {
    const local = await ensureLocalOrder(user.tenant_id, tiktokOrderId);
    return NextResponse.json(local);
  } catch (err) {
    console.error("[TikTok Shop] Error sincronizando pedido:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
