import { NextRequest, NextResponse } from "next/server";
import { authenticateExtensionRequest } from "@/lib/auth/extension-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Usado por el popup de la extensión Chrome al pulsar "Conectar": si la key es
 * válida, confirma la conexión y devuelve la configuración real del tenant
 * (impresión automática), editable en Configuración. El popup firma el
 * literal "{}" para esta petición GET (no hay body real que firmar).
 */
export async function GET(req: NextRequest) {
  const tenantId = await authenticateExtensionRequest(req, "{}");
  if (!tenantId) return NextResponse.json({ error: "API key inválida." }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("tenants")
    .select("auto_print_enabled")
    .eq("id", tenantId)
    .maybeSingle();

  return NextResponse.json({
    auto_print_enabled: data?.auto_print_enabled === false ? 0 : 1,
  });
}
