import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getOrdersForExport } from "@/lib/orders/list";
import { toCsv } from "@/lib/csv";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const orders = await getOrdersForExport(user.tenant_id, {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    q: sp.get("q") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    dir: sp.get("dir") === "asc" ? "asc" : "desc",
  });

  const csv = toCsv(orders, [
    { key: "tk", label: "TK" },
    { key: "external_order_id", label: "ID pedido TikTok" },
    { key: "cliente", label: "Cliente" },
    { key: "precio_cents", label: "Precio (céntimos)" },
    { key: "moneda", label: "Moneda" },
    { key: "fecha_detectado", label: "Fecha detectado" },
    { key: "estado_impresion", label: "Estado" },
    { key: "reimpresiones", label: "Reimpresiones" },
    { key: "notes", label: "Notas" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pedidos.csv"',
    },
  });
}
