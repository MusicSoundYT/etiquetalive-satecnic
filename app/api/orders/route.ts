import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const tenantId = user.tenant_id;
  const { searchParams } = new URL(req.url);
  const requestedPage = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE)));
  const dateFrom = searchParams.get("from");
  const dateTo = searchParams.get("to");

  let countQuery = supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (dateFrom) countQuery = countQuery.gte("fecha_detectado", dateFrom);
  if (dateTo) countQuery = countQuery.lte("fecha_detectado", dateTo);

  const { count, error: countError } = await countQuery;
  if (countError) return NextResponse.json({ error: "No se pudieron cargar los pedidos." }, { status: 500 });

  const total = count ?? 0;
  if (total === 0) return NextResponse.json({ orders: [], total: 0, page: 1, pageSize });

  // Evita pedir a PostgREST un rango más allá de las filas existentes (416).
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let dataQuery = supabaseAdmin
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("fecha_detectado", { ascending: false });
  if (dateFrom) dataQuery = dataQuery.gte("fecha_detectado", dateFrom);
  if (dateTo) dataQuery = dataQuery.lte("fecha_detectado", dateTo);

  const { data, error } = await dataQuery.range(from, to);
  if (error) return NextResponse.json({ error: "No se pudieron cargar los pedidos." }, { status: 500 });

  return NextResponse.json({ orders: data, total, page, pageSize });
}
