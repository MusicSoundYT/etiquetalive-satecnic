import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";

const bodySchema = z.object({ active: z.boolean() });

/**
 * "Dar de baja" / reactivar un cliente. Actúa sobre el tenant entero (no solo
 * el usuario) porque una cuenta puede tener varios usuarios y lo que se
 * bloquea es el acceso al Servicio, no un login individual. Al desactivar,
 * además se revocan todas las sesiones activas de ese tenant para que el
 * bloqueo sea inmediato, no solo en el próximo login.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getSessionUser();
  if (!admin?.is_admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data: targetUser } = await supabaseAdmin
    .from("users")
    .select("tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (!targetUser?.tenant_id) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  const newStatus = parsed.data.active ? "active" : "disabled";
  const { error } = await supabaseAdmin
    .from("tenants")
    .update({ status: newStatus })
    .eq("id", targetUser.tenant_id);
  if (error) return NextResponse.json({ error: "No se pudo actualizar el estado." }, { status: 500 });

  if (!parsed.data.active) {
    const { data: tenantUsers } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("tenant_id", targetUser.tenant_id);
    const tenantUserIds = (tenantUsers ?? []).map((u) => u.id);
    if (tenantUserIds.length > 0) {
      await supabaseAdmin
        .from("auth_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("user_id", tenantUserIds)
        .is("revoked_at", null);
    }
  }

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    admin_email: admin.email,
    action: "set_tenant_status",
    target_user_id: id,
    details: { tenant_id: targetUser.tenant_id, status: newStatus },
  });

  return NextResponse.json({ status: "ok" });
}
