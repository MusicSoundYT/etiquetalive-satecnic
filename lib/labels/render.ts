import "server-only";
import QRCode from "qrcode";
import type { LabelTemplate } from "@/lib/labels/types";

type OrderForLabel = {
  tk: string;
  external_order_id: string | null;
  cliente: string | null;
  precio_cents: number;
  moneda: string;
  fecha_pedido: string | null;
  raw_payload: unknown;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatEtiquetaDate(value: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const TIKTOK_NAME_KEYS = [
  "tiktok_name",
  "tiktokName",
  "auction_winner",
  "winner",
  "tiktok_username",
  "username",
  "user_name",
  "buyer_username",
  "buyer_name",
  "nickname",
  "nickName",
  "display_name",
];

function extractTikTokName(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const data = raw as Record<string, unknown>;
  const containers = [data, data.buyer, data.customer, data.user, data.event].filter(
    (c): c is Record<string, unknown> => !!c && typeof c === "object"
  );
  for (const container of containers) {
    for (const key of TIKTOK_NAME_KEYS) {
      const value = container[key];
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
    }
  }
  return "";
}

/**
 * Genera el HTML imprimible de la etiqueta (tamaño físico real vía @page) para una impresora térmica/láser.
 * En modo `preview` (usado por "Ver") el QR no lleva el payload real del pedido (no es escaneable/válido
 * para envío), para que no se pueda usar como sustituto de una impresión pagada.
 */
export async function generateLabelHtml(
  order: OrderForLabel,
  t: LabelTemplate,
  opts?: { preview?: boolean }
): Promise<string> {
  const preview = opts?.preview ?? false;
  const priceStr = `${(order.precio_cents / 100).toFixed(2)} ${order.moneda || "EUR"}`;
  const dateStr = formatEtiquetaDate(order.fecha_pedido);
  const qrPayload = preview ? "PREVIEW-NO-VALIDO" : String(order.external_order_id || order.tk || "");
  const tiktokName = extractTikTokName(order.raw_payload);

  const rows = [
    { enabled: t.show_auction, order: t.order_auction, html: `<div class="title">SUBASTA</div>` },
    {
      enabled: t.show_cliente,
      order: t.order_cliente,
      html: `<div class="row cliente autofit-row"><b>Cliente</b><span class="autofit-text">${escapeHtml(order.cliente || "")}</span></div>`,
    },
    {
      enabled: t.show_tiktok_name,
      order: t.order_tiktok_name,
      html: `<div class="row tiktok autofit-row"><b>TikTok</b><span class="autofit-text">${escapeHtml(tiktokName)}</span></div>`,
    },
    {
      enabled: t.show_order_id,
      order: t.order_order_id,
      html: `<div class="row order"><b>Nº Pedido</b><span>${escapeHtml(order.external_order_id || order.tk)}</span></div>`,
    },
    {
      enabled: t.show_price,
      order: t.order_price,
      html: `<div class="row price"><b>Precio</b><span>${escapeHtml(priceStr)}</span></div>`,
    },
    {
      enabled: t.show_datetime,
      order: t.order_datetime,
      html: `<div class="row fecha"><b>Fecha</b><span>${escapeHtml(dateStr)}</span></div>`,
    },
  ]
    .filter((r) => r.enabled)
    .sort((a, b) => a.order - b.order)
    .map((r) => r.html)
    .join("");

  let qrSrc = "";
  if (t.show_qr) {
    try {
      qrSrc = await QRCode.toDataURL(qrPayload, { margin: 0, width: 240, errorCorrectionLevel: "M" });
    } catch {
      qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrPayload)}`;
    }
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { size: ${t.label_width_mm}mm ${t.label_height_mm}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { -webkit-user-select: none; user-select: none; -webkit-user-drag: none; }
  body { width: ${t.label_width_mm}mm; height: ${t.label_height_mm}mm; display: flex; font-family: Arial, sans-serif; overflow: hidden; color:#111; }
  .label { display: flex; align-items: center; gap: 1mm; width: 100%; height: 100%; padding: ${t.padding_mm}mm; letter-spacing: ${t.letter_spacing_pt}pt; line-height: 1.12; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: ${t.line_spacing_mm}mm; font-size: ${t.label_font_pt}pt; overflow:hidden; }
  .qr-area { display: flex; align-items: center; justify-content: center; width: ${t.show_qr ? t.qr_size_mm : 0}mm; height: ${t.show_qr ? t.qr_size_mm : 0}mm; flex: 0 0 auto; }
  .qr-area img { width: ${t.qr_size_mm}mm; height: ${t.qr_size_mm}mm; display: block; image-rendering: pixelated; }
  @media print { img, .label { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  .title { font-size: ${t.auction_font_pt}pt; font-weight: 900; color: #111; text-transform: uppercase; letter-spacing: ${Math.max(t.letter_spacing_pt, 0.6)}pt; border: 1px solid #111; width: max-content; padding: 1mm 2mm; border-radius: 1mm; margin-bottom: ${t.title_data_gap_mm}mm; }
  .row { display:grid; grid-template-columns:${t.label_col_width_mm}mm 1fr; column-gap:${t.column_gap_mm}mm; align-items:baseline; min-width:0; }
  .cliente { font-size: ${t.customer_font_pt}pt; }
  .tiktok { font-size: ${t.tiktok_font_pt}pt; }
  .order { font-size: ${t.order_font_pt}pt; }
  .price { font-size: ${t.price_font_pt}pt; font-weight: bold; }
  .fecha { font-size: ${t.date_font_pt}pt; color: #999; }
  .row b { font-weight:900; min-width: 0; }
  .row span { font-weight:600; overflow:hidden; white-space:nowrap; }
  .autofit-text { display:block; min-width:0; }
</style></head><body>
<div class="label">
  <div class="info">
    ${rows || '<div class="row"><span>Etiqueta sin campos activos</span></div>'}
  </div>
  ${t.show_qr ? `<div class="qr-area"><img src="${qrSrc}" alt="QR" draggable="false" oncontextmenu="return false" /></div>` : ""}
</div>
<script>
(function(){
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  document.addEventListener('dragstart', function(e){ e.preventDefault(); });
  function fitAutoText(){
    document.querySelectorAll('.autofit-text').forEach(function(el){
      el.style.fontSize = '';
      var size = parseFloat(getComputedStyle(el).fontSize) || 10;
      var min = 6;
      var guard = 0;
      while (el.scrollWidth > el.clientWidth && size > min && guard < 24) {
        size -= 0.5;
        el.style.fontSize = size + 'px';
        guard++;
      }
    });
  }
  window.addEventListener('load', fitAutoText);
  window.addEventListener('beforeprint', fitAutoText);
  setTimeout(fitAutoText, 80);
})();
</script>
</body></html>`;
}
