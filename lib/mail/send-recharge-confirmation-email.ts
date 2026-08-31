import "server-only";
import { sendMail } from "@/lib/mail/transport";
import { emailLayout, statBox } from "@/lib/mail/email-layout";
import { env } from "@/lib/env";

const eur = (cents: number) => (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** Al cliente, en cuanto se confirma una recarga de saldo (Renovación → 5/10/20/50€ o importe a mano). */
export async function sendRechargeConfirmationEmail(to: string, opts: { name?: string; amountCents: number; balanceAfterCents: number }) {
  const saludo = opts.name ? `Hola, ${opts.name}` : "Hola";
  const body = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#18181b;">${saludo} 👋</p>
    <p style="margin:0 0 16px;">Hemos recibido tu recarga de saldo en Etiqueta Live. Ya está disponible en tu cuenta.</p>
    ${statBox([
      { label: "Importe recargado", value: eur(opts.amountCents) },
      { label: "Saldo actual", value: eur(opts.balanceAfterCents), emphasis: true },
    ])}
    <p style="margin:16px 0 0;">
      <a href="${env.appUrl}/account/recharge" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">Ver mi cuenta</a>
    </p>
    <p style="margin:24px 0 0;color:#71717a;font-size:12px;">Si no reconoces esta recarga, ponte en contacto con nosotros escribiendo a <a href="mailto:soporte@woow.tienda" style="color:#71717a;">soporte@woow.tienda</a>.</p>
  `;
  await sendMail({
    to,
    subject: "Recarga confirmada — Etiqueta Live",
    html: emailLayout({ product: "Etiqueta Live", bodyHtml: body }),
  });
}
