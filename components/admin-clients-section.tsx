"use client";

import { useEffect, useRef, useState } from "react";
import { AdminUsersTable } from "@/components/admin-users-table";
import { AdminOrdersPanel } from "@/components/admin-orders-panel";

export function AdminClientsSection() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantLabel, setTenantLabel] = useState<string | null>(null);
  const ordersRef = useRef<HTMLDivElement>(null);

  // Al elegir un cliente, se baja solo hasta sus pedidos — si no, con la
  // tabla de clientes arriba, hay que desplazarse a mano para verlos.
  useEffect(() => {
    if (tenantId) ordersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tenantId]);

  return (
    <div className="space-y-6">
      <AdminUsersTable onSelectTenant={(id, label) => { setTenantId(id); setTenantLabel(label); }} />
      <div ref={ordersRef}>
        {tenantId && tenantLabel ? (
          // key=tenantId: remonta el panel al cambiar de cliente, así el propio
          // estado inicial de useState resetea filtros/página sin necesidad de
          // un efecto que los reescriba a mano.
          <AdminOrdersPanel key={tenantId} tenantId={tenantId} tenantLabel={tenantLabel} />
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Haz clic en el nombre de un cliente en la tabla de arriba para ver sus pedidos.
          </p>
        )}
      </div>
    </div>
  );
}
