import { NextRequest, NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { corsPreflight, withCors } from "@/lib/cors";

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/** Log de diagnóstico de peticiones de red que parecen relacionadas con subastas. Solo autenticación. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const tenantId = await authenticateExtensionRequest(req, rawBody);
  if (!tenantId) return withCors(req, NextResponse.json({ error: "No autorizado." }, { status: 401 }));

  return withCors(req, NextResponse.json({ status: "ok" }));
}
