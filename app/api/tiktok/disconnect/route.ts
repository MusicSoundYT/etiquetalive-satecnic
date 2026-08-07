import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { deleteConnection } from "@/lib/tiktok-shop/connection";

export async function POST() {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  await deleteConnection(user.tenant_id);
  return NextResponse.json({ status: "ok" });
}
