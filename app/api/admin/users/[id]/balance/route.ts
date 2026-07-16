import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adjustBalance } from "@/lib/wallet/ledger";

const bodySchema = z.object({
  amountCents: z
    .number()
    .int()
    .refine((n) => n !== 0, "El importe no puede ser 0."),
  reason: z.string().trim().max(300).optional(),
});

/** Ajuste manual de saldo (crédito o débito) por un administrador — p. ej. para corregir un error de cobro. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  const { amountCents, reason } = parsed.data;

  const { data: target } = await supabaseAdmin.from("users").select("id").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  const type = amountCents >= 0 ? "admin_credit" : "admin_debit";
  let result: { balanceAfterCents: number };
  try {
    result = await adjustBalance(id, amountCents, type, {
      description: reason || `Ajuste manual de saldo por administrador (${admin.email})`,
      metadata: { admin_user_id: admin.id, admin_email: admin.email },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo ajustar el saldo." }, { status: 500 });
  }

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    admin_email: admin.email,
    action: "adjust_balance",
    target_user_id: id,
    details: { amount_cents: amountCents, reason: reason ?? null },
  });

  return NextResponse.json({ status: "ok", balance_cents: result.balanceAfterCents });
}
