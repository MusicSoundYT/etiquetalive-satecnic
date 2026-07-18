import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAdminOrdersForExport } from "@/lib/orders/admin-list";
import { toCsv } from "@/lib/csv";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const orders = await getAdminOrdersForExport({
    tenantId: sp.get("tenantId") ?? undefined,
    q: sp.get("q") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    dir: sp.get("dir") === "asc" ? "asc" : "desc",
  });

  // "Comprador" ya viene enmascarado desde getAdminOrdersForExport (primera
  // letra + asteriscos) y no se incluye el precio: privacidad de los
  // compradores de tus clientes, ver política de privacidad.
  const csv = toCsv(
    orders.map((o) => ({ ...o, cliente_negocio: o.tenants?.business_name ?? "" })),
    [
      { key: "cliente_negocio", label: "Cliente (negocio)" },
      { key: "tk", label: "TK" },
      { key: "external_order_id", label: "ID pedido TikTok" },
      { key: "cliente", label: "Comprador" },
      { key: "fecha_detectado", label: "Fecha detectado" },
      { key: "estado_impresion", label: "Estado" },
      { key: "reimpresiones", label: "Reimpresiones" },
    ]
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pedidos-admin.csv"',
    },
  });
}
