import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("id, email, name, last_name, tenant_id, is_admin, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "No se pudo cargar la lista." }, { status: 500 });

  const userIds = (users ?? []).map((u) => u.id);
  const { data: balances } =
    userIds.length > 0
      ? await supabaseAdmin
          .from("user_balances")
          .select("user_id, current_tier, balance_cents, is_blocked, is_demo")
          .in("user_id", userIds)
      : { data: [] };

  const balanceByUser = new Map((balances ?? []).map((b) => [b.user_id, b]));

  const enriched = (users ?? []).map((u) => ({
    ...u,
    balance: balanceByUser.get(u.id) ?? null,
  }));

  return NextResponse.json({ users: enriched });
}
