import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { isRateLimited } from "@/lib/auth/rate-limit";
import { decryptApiKey } from "@/lib/auth/api-key-crypto";

const bodySchema = z.object({ password: z.string().min(1) });

/**
 * Vuelve a mostrar la API key activa en claro (p. ej. para pegarla en un
 * segundo ordenador). Exige repetir la contraseña, igual que el resto de
 * acciones sensibles de la cuenta. Las keys generadas antes de este cambio no
 * tienen encrypted_key guardado y no se pueden recuperar: hay que regenerarlas.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  if (isRateLimited(`api-key-reveal:${user.id}`)) {
    return NextResponse.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data: dbUser } = await supabaseAdmin
    .from("users")
    .select("password_hash")
    .eq("id", user.id)
    .maybeSingle();

  if (!dbUser?.password_hash || !(await verifyPassword(parsed.data.password, dbUser.password_hash))) {
    return NextResponse.json({ error: "La contraseña no es correcta." }, { status: 401 });
  }

  const { data: apiKey } = await supabaseAdmin
    .from("api_keys")
    .select("encrypted_key")
    .eq("tenant_id", user.tenant_id)
    .eq("status", "active")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!apiKey?.encrypted_key) {
    return NextResponse.json(
      { error: "Esta clave se creó antes de esta función y no se puede recuperar. Genera una nueva." },
      { status: 404 }
    );
  }

  try {
    const key = decryptApiKey(apiKey.encrypted_key);
    return NextResponse.json({ key });
  } catch {
    return NextResponse.json({ error: "No se pudo recuperar la clave." }, { status: 500 });
  }
}
