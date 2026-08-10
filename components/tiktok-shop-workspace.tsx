"use client";

import { useEffect, useState } from "react";
import type { AuctionOrderRow } from "@/lib/tiktok-shop/auction-orders";
import { TikTokPrintWatcher } from "@/components/tiktok-print-watcher";
import { TikTokOrdersTable } from "@/components/tiktok-orders-table";

type Shop = {
  shop_id: string;
  shop_name: string | null;
  region: string | null;
  shop_code: string | null;
};

const STORAGE_KEY = "el_selected_tiktok_shop_id";

/**
 * Cuando el tenant tiene varias tiendas de TikTok conectadas (varias
 * trabajadoras, cada una con la suya), cada una debe ver e imprimir SOLO
 * los pedidos de su propia tienda, aunque las dos usen la misma cuenta de
 * EtiquetaLive. La selección se guarda en localStorage: es una preferencia
 * de este navegador/ordenador concreto, no de la cuenta — así cada
 * trabajadora, en su propio equipo, mantiene su tienda elegida aunque el
 * login sea el mismo para las dos.
 */
export function TikTokShopWorkspace({
  shops,
  initialOrders,
  initialNextPageToken,
}: {
  shops: Shop[];
  initialOrders: AuctionOrderRow[];
  initialNextPageToken: string | null;
}) {
  const [selectedShopId, setSelectedShopId] = useState<string | null>(
    shops.length > 1 ? shops[0].shop_id : null
  );

  useEffect(() => {
    if (shops.length <= 1) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && shops.some((s) => s.shop_id === stored)) {
      // Deferido: evita el aviso de set-state-in-effect por llamar a
      // setState de forma síncrona en el cuerpo del efecto.
      setTimeout(() => setSelectedShopId(stored), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectShop(shopId: string) {
    setSelectedShopId(shopId);
    localStorage.setItem(STORAGE_KEY, shopId);
  }

  return (
    <div className="space-y-4">
      {shops.length > 1 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <span className="font-medium text-amber-900 dark:text-amber-200">Tienda:</span>
          <select
            value={selectedShopId ?? ""}
            onChange={(e) => handleSelectShop(e.target.value)}
            className="rounded border border-amber-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {shops.map((s) => (
              <option key={s.shop_id} value={s.shop_id}>
                {s.shop_name || s.shop_code || s.shop_id}
              </option>
            ))}
          </select>
          <span className="text-xs text-amber-700 dark:text-amber-300">
            Esta elección se guarda solo en este ordenador — cada trabajadora elige la suya.
          </span>
        </div>
      )}

      <TikTokPrintWatcher shopId={selectedShopId} />
      <TikTokOrdersTable
        initialOrders={initialOrders}
        initialNextPageToken={initialNextPageToken}
        shopId={selectedShopId}
      />
    </div>
  );
}
