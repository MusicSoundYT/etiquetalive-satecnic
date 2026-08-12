import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { saveAppCredentialsForTenant } from "@/lib/tiktok-shop/app-credentials";

const bodySchema = z.object({
  appKey: z.string().trim().min(1, "Falta el App Key."),
  appSecret: z.string().trim().min(1, "Falta el App Secret."),
  serviceId: z.string().trim().min(1, "Falta el Service ID."),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  try {
    await saveAppCredentialsForTenant(user.tenant_id, parsed.data);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
