import "server-only";
import { PDFDocument } from "pdf-lib";

/**
 * Une en un único PDF las etiquetas de envío (ya generadas) de varios
 * pedidos del mismo cliente — a petición del cliente: cuando alguien tiene
 * 2+ pedidos, quiere que se abra directamente UN pdf con las dos etiquetas
 * dentro, en vez de tener que abrir una pestaña por pedido a mano.
 *
 * Cada doc_url de TikTok ya es en sí un PDF de 1-2 páginas (etiqueta +
 * albarán, ver getPackageShippingDocument) — aquí solo se concatenan sus
 * páginas en el orden recibido, sin tocar el contenido de ninguna.
 *
 * Si CUALQUIER paso falla (una URL no descarga, un PDF viene corrupto...),
 * se lanza y quien llame debe caer de vuelta al comportamiento de antes
 * (una pestaña por pedido) — nunca debe perderse una etiqueta por un fallo
 * al fusionar.
 */
export async function mergeShippingLabelPdfs(docUrls: string[]): Promise<Buffer> {
  if (!docUrls.length) throw new Error("No hay ningún documento que unir.");

  const merged = await PDFDocument.create();
  for (const url of docUrls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo descargar el PDF de ${url} (HTTP ${res.status}).`);
    const bytes = await res.arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  return Buffer.from(await merged.save());
}
