import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getValidAccessToken, getShopsForConnection, toApiCredentials } from "@/lib/tiktok-shop/connection";
import { registerOrderStatusWebhook, listRegisteredWebhooks } from "@/lib/tiktok-shop/api-client";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  try {
    const connection = await getValidAccessToken(user.tenant_id);
    const shops = await getShopsForConnection(connection.id);
    if (!shops.length) return NextResponse.json({ active: false, webhooks: [] });

    // Con Fase 1 solo hay una tienda por conexión en la práctica — se
    // comprueba con la primera. Si en el futuro hay más de una, esto habría
    // que revisarlo por tienda.
    const webhooks = await listRegisteredWebhooks(toApiCredentials(connection), shops[0].shop_cipher);
    const active = webhooks.some(
      (w) => w.event_type === "ORDER_STATUS_CHANGE" && w.address === `${env.appUrl}/api/tiktok/webhooks`
    );
    return NextResponse.json({ active, webhooks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}

/**
 * Registro manual del webhook — normalmente ya se hace solo al conectar o
 * renovar el token (ver connection.ts), pero las conexiones creadas ANTES
 * de tener esta función todavía no lo tienen suscrito. Este botón cubre ese
 * caso, y sirve también para volver a intentarlo si el registro automático
 * falló alguna vez.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  try {
    const connection = await getValidAccessToken(user.tenant_id);
    const shops = await getShopsForConnection(connection.id);
    if (!shops.length) return NextResponse.json({ error: "No hay ninguna tienda conectada." }, { status: 404 });

    for (const shop of shops) {
      await registerOrderStatusWebhook(toApiCredentials(connection), shop.shop_cipher, `${env.appUrl}/api/tiktok/webhooks`);
    }
    return NextResponse.json({ status: "ok", address: `${env.appUrl}/api/tiktok/webhooks` });
  } catch (err) {
    console.error("[TikTok Shop] Error registrando el webhook manualmente:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 }
    );
  }
}
