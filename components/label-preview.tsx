"use client";

/**
 * Vista previa de solo lectura ("Ver"). Deliberadamente NO incluye botón de
 * imprimir: el QR de esta vista no lleva el payload real del pedido (ver
 * lib/labels/render.ts, modo preview), así que aunque alguien la imprima o
 * guarde la página no obtiene una etiqueta válida para el envío. La impresión
 * real (con cobro) se hace desde el listado de pedidos.
 */
export function LabelPreview({ orderId }: { orderId: string }) {
  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="overflow-auto rounded-lg border border-zinc-200 bg-zinc-100 p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <iframe
        src={`/api/orders/${orderId}/label?mode=view`}
        title="Etiqueta (vista previa)"
        className="mx-auto h-40 w-full max-w-xs bg-white"
      />
    </div>
  );
}
