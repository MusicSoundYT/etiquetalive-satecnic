import { NextRequest, NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";

/** Latido de la extensión (recarga de página, inicio del content script, etc). Solo autenticación. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const tenantId = await authenticateExtensionRequest(req, rawBody);
  if (!tenantId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  return NextResponse.json({ status: "ok" });
}
