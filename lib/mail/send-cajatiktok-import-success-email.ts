import "server-only";
import { sendMail } from "@/lib/mail/transport";
import { emailLayout, statBox } from "@/lib/mail/email-layout";

/** A cada persona del grupo, cuando la importación automática del día anterior (08:00-08:00) trae pedidos. */
export async function sendCajaTiktokImportSuccessEmail(to: string[], opts: { grupoNombre: string; date: string; totalOrders: number; totalClients: number }) {
  if (!to.length) return;
  const body = `
    <p style="margin:0 0 2px;font-size:18px;font-weight:700;color:#18181b;">${opts.grupoNombre}</p>
    <p style="margin:0 0 16px;font-size:13px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.04em;">Importación lista</p>
    <p style="margin:0 0 16px;">La importación automática de tu directo se ha realizado correctamente. Ya puedes entrar en Caja TikTok para empezar a preparar los envíos.</p>
    ${statBox([
      { label: "Fecha del directo", value: opts.date },
      { label: "Pedidos importados", value: String(opts.totalOrders), emphasis: true },
      { label: "Clientes", value: String(opts.totalClients) },
    ])}
    <p style="margin:16px 0 0;">
      <a href="https://cajatiktok.satecnic.es" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">Abrir Caja TikTok</a>
    </p>
  `;
  const html = emailLayout({ product: "Caja TikTok", bodyHtml: body });
  await Promise.all(
    to.map((email) =>
      sendMail({ to: email, subject: `Importación lista — ${opts.grupoNombre} (${opts.date})`, html, fromName: "Caja TikTok" }).catch((err) =>
        console.error(`No se pudo avisar por correo a ${email} de la importación correcta:`, err)
      )
    )
  );
}
