import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE_SIZE = 20;

/** Historial de movimientos de saldo del usuario (recargas, cobros de etiquetas, bonos...). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await supabaseAdmin
    .from("balance_transactions")
    .select("id, type, amount_cents, balance_after_cents, description, created_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 500 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data: monthTxs } = await supabaseAdmin
    .from("balance_transactions")
    .select("type, amount_cents")
    .eq("user_id", user.id)
    .gte("created_at", monthStart);

  const spentThisMonthCents = (monthTxs ?? [])
    .filter((t) => t.type === "label_consumption")
    .reduce((sum, t) => sum + Math.abs(t.amount_cents), 0);
  const rechargedThisMonthCents = (monthTxs ?? [])
    .filter((t) => t.type === "recharge")
    .reduce((sum, t) => sum + t.amount_cents, 0);

  return NextResponse.json({
    transactions: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    summary: { spentThisMonthCents, rechargedThisMonthCents },
  });
}
