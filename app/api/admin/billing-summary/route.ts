import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getMonthlyBillingSummary } from "@/lib/admin/monthly-billing-summary";

export async function GET(req: NextRequest) {
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const now = new Date();
  // Por defecto, el mes actual (el panel llama a este endpoint siempre con
  // year/month explícitos, pero se mantiene un valor por defecto sensato
  // por si se llama sin parámetros).
  const year = Number(req.nextUrl.searchParams.get("year")) || now.getUTCFullYear();
  const month = Number(req.nextUrl.searchParams.get("month")) || now.getUTCMonth() + 1;

  const summary = await getMonthlyBillingSummary(year, month);
  return NextResponse.json(summary);
}
