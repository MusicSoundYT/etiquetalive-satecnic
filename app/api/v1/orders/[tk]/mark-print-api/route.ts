import { NextRequest, NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { corsPreflight, withCors } from "@/lib/cors";

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * Telemetría: la extensión avisa aquí justo antes de invocar window.print() en
 * un flujo de auto-impresión. No afecta al cobro (eso se gestiona en
 * /api/orders/[id]/print y /reprint) — solo confirma autenticación.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ tk: string }> }) {
  await params;
  const rawBody = await req.text();
  const tenantId = await authenticateExtensionRequest(req, rawBody);
  if (!tenantId) return withCors(req, NextResponse.json({ error: "No autorizado." }, { status: 401 }));

  return withCors(req, NextResponse.json({ status: "ok" }));
}
