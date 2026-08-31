import "server-only";
import { sendMail } from "@/lib/mail/transport";
import { emailLayout, statBox } from "@/lib/mail/email-layout";

const SUPPORT_EMAIL = "soporte@woow.tienda";

/** A cada persona del grupo — aviso genérico, sin detalles técnicos: no es su problema, es cosa nuestra arreglarlo. */
export async function sendCajaTiktokImportErrorCustomerEmail(to: string[], opts: { grupoNombre: string; date: string }) {
  if (!to.length) return;
  const body = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#18181b;">Hemos detectado un error en tu importación</p>
    <p style="margin:0 0 16px;">La importación automática del directo de <strong>${opts.grupoNombre}</strong> del ${opts.date} no se ha podido completar. Ya lo sabemos y estamos trabajando en ello.</p>
    <p style="margin:0;color:#71717a;font-size:13px;">Si necesitas los pedidos de hoy con urgencia, puedes importarlos tú mismo desde Caja TikTok (menú → Importar sesión de TikTok o Actualizar Excel API) mientras lo resolvemos.</p>
  `;
  const html = emailLayout({ product: "Caja TikTok", bodyHtml: body });
  await Promise.all(
    to.map((email) =>
      sendMail({ to: email, subject: `Error en la importación — ${opts.grupoNombre} (${opts.date})`, html, fromName: "Caja TikTok" }).catch((err) =>
        console.error(`No se pudo avisar por correo a ${email} del error de importación:`, err)
      )
    )
  );
}

/** A soporte@woow.tienda — con el detalle técnico completo, para poder arreglarlo. */
export async function sendCajaTiktokImportErrorAdminEmail(opts: { grupoNombre: string; date: string; errorMessage: string }) {
  const body = `
    <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#dc2626;">Error en la exportación diaria de Caja TikTok</p>
    ${statBox([
      { label: "Grupo", value: opts.grupoNombre },
      { label: "Fecha", value: opts.date },
      { label: "Hora del aviso", value: new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) },
    ])}
    <p style="margin:16px 0 6px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Detalle del error</p>
    <pre style="margin:0;padding:12px 14px;background:#18181b;color:#f4f4f5;border-radius:8px;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${opts.errorMessage}</pre>
  `;
  await sendMail({
    to: SUPPORT_EMAIL,
    subject: `Error importación Caja TikTok — ${opts.grupoNombre} (${opts.date})`,
    html: emailLayout({ product: "Caja TikTok", bodyHtml: body }),
    fromName: "Caja TikTok",
  });
}
