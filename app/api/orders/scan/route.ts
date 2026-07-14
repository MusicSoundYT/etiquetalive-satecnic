import { NextRequest, NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";

/**
 * Log de diagnóstico: la extensión manda aquí cada barrido bruto de la página
 * de pedidos (antes de parsear pedidos concretos, que va por /api/v1/order/detect).
 * La extensión no mira la respuesta — solo hace falta aceptar la petición
 * autenticada para que no falle en la consola del navegador del cliente.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const tenantId = await authenticateExtensionRequest(req, rawBody);
  if (!tenantId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  return NextResponse.json({ status: "ok" });
}
