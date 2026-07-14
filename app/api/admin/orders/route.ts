import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAdminOrdersPage, ADMIN_ORDERS_PAGE_SIZE } from "@/lib/orders/admin-list";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const filter = {
    tenantId: sp.get("tenantId") ?? undefined,
    q: sp.get("q") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    dir: sp.get("dir") === "asc" ? ("asc" as const) : ("desc" as const),
  };

  try {
    const { orders, total } = await getAdminOrdersPage(page, filter);
    return NextResponse.json({ orders, total, page, pageSize: ADMIN_ORDERS_PAGE_SIZE });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudieron cargar los pedidos." }, { status: 500 });
  }
}
