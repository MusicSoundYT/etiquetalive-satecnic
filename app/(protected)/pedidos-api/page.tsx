import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { getConnectionForTenant, getShopsForConnection } from "@/lib/tiktok-shop/connection";
import { listAuctionOrders } from "@/lib/tiktok-shop/auction-orders";
import { TikTokShopWorkspace } from "@/components/tiktok-shop-workspace";

export default async function PedidosApiPage() {
  const user = await requireSession();
  const connection = user.tenant_id ? await getConnectionForTenant(user.tenant_id) : null;
  const shops = connection ? await getShopsForConnection(connection.id) : [];

  // Coincide con la elección por defecto del selector de tienda en el
  // cliente (la primera de la lista) — si el navegador tiene otra guardada
  // en localStorage, se recarga sola nada más montar.
  const initialShopId = shops.length > 1 ? shops[0].shop_id : undefined;

  const initial =
    connection && user.tenant_id
      ? await listAuctionOrders(user.tenant_id, { shopId: initialShopId })
      : { orders: [], nextPageToken: null };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Pedidos (API)</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Pedidos de subasta LIVE leídos directamente de la API oficial de TikTok Shop, sin pasar por
          la extensión de Chrome.
        </p>
      </div>

      {!connection && (
        <div className="max-w-md rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-amber-900 dark:text-amber-200">
            Todavía no has conectado esta cuenta con TikTok Shop.
          </p>
          <Link
            href="/account"
            className="mt-2 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Ir a Configuración
          </Link>
        </div>
      )}

      {connection && (
        <TikTokShopWorkspace
          shops={shops}
          initialOrders={initial.orders}
          initialNextPageToken={initial.nextPageToken}
        />
      )}
    </div>
  );
}
