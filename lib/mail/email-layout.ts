import "server-only";

// Plantilla compartida para los correos "de marca" (más cuidados que los
// transaccionales de siempre — bienvenida, restablecer contraseña... — que
// se dejan tal cual, son de un solo enlace y no hace falta más). Tablas y
// estilos en línea a propósito: es lo único que se renderiza de forma
// fiable en Gmail/Outlook/Apple Mail, nada de flex/grid ni <style> aparte.
export function emailLayout(opts: { product: "Etiqueta Live" | "Caja TikTok"; bodyHtml: string }): string {
  const { product, bodyHtml } = opts;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
          <tr>
            <td style="padding:22px 32px;border-bottom:1px solid #e4e4e7;">
              <span style="font-size:15px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">${product}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#27272a;font-size:14px;line-height:1.65;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:11px;">
              © ${new Date().getFullYear()} LUCKY BARNAVIT, S.L.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Caja destacada tipo "recibo" para un importe/dato clave — reutilizada por
// las nuevas plantillas de recarga y de importación de Caja TikTok.
export function statBox(rows: Array<{ label: string; value: string; emphasis?: boolean }>): string {
  const rowsHtml = rows
    .map(
      (r) => `
        <tr>
          <td style="padding:6px 0;color:#71717a;font-size:13px;">${r.label}</td>
          <td style="padding:6px 0;text-align:right;font-family:'SF Mono',ui-monospace,monospace;font-size:${r.emphasis ? "18px" : "13px"};font-weight:${r.emphasis ? "700" : "600"};color:${r.emphasis ? "#18181b" : "#3f3f46"};">${r.value}</td>
        </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:10px;padding:14px 18px;margin:18px 0;">${rowsHtml}</table>`;
}
