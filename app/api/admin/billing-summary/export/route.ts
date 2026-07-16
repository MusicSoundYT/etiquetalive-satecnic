import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getMonthlyBillingSummary, monthsInRange } from "@/lib/admin/monthly-billing-summary";
import { toCsv } from "@/lib/csv";

const MAX_MONTHS = 60; // 5 años de margen de sobra, evita exportaciones desmesuradas

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export async function GET(req: NextRequest) {
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const fromYear = Number(sp.get("fromYear"));
  const fromMonth = Number(sp.get("fromMonth"));
  const toYear = Number(sp.get("toYear"));
  const toMonth = Number(sp.get("toMonth"));

  if (!fromYear || !fromMonth || !toYear || !toMonth) {
    return NextResponse.json({ error: "Faltan los parámetros del rango de meses." }, { status: 400 });
  }

  const months = monthsInRange(fromYear, fromMonth, toYear, toMonth).slice(0, MAX_MONTHS);
  const summaries = await Promise.all(months.map((m) => getMonthlyBillingSummary(m.year, m.month)));

  const rows = summaries.map((s) => ({
    periodo: `${MONTH_NAMES[s.month - 1]} de ${s.year}`,
    saldo_recargado_euros: (s.rechargedCents / 100).toFixed(2),
    facturado_por_etiquetas_euros: (s.totalCents / 100).toFixed(2),
    etiquetas_cobradas: s.ordersCount,
    clientes_con_actividad: s.tenantsCount,
  }));

  const csv = toCsv(rows, [
    { key: "periodo", label: "Periodo" },
    { key: "saldo_recargado_euros", label: "Saldo recargado (€)" },
    { key: "facturado_por_etiquetas_euros", label: "Facturado por etiquetas (€)" },
    { key: "etiquetas_cobradas", label: "Etiquetas cobradas" },
    { key: "clientes_con_actividad", label: "Clientes con actividad" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="facturacion-mensual.csv"',
    },
  });
}
