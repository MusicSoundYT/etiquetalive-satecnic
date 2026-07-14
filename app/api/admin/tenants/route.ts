import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Lista ligera de clientes (tenants) para el selector de filtro del panel de admin. */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id, business_name")
    .order("business_name", { ascending: true });

  if (error) return NextResponse.json({ error: "No se pudo cargar la lista." }, { status: 500 });
  return NextResponse.json({ tenants: data ?? [] });
}
