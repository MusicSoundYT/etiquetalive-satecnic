import "server-only";
import { sendMail } from "@/lib/mail/transport";
import { emailLayout, statBox } from "@/lib/mail/email-layout";

const SUPPORT_EMAIL = "soporte@woow.tienda";

const eur = (cents: number) => (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** A soporte@woow.tienda, en cuanto se confirma una recarga — aviso interno, no lo ve el cliente. */
export async function sendRechargeAdminNotificationEmail(opts: {
  userEmail: string;
  userId: string;
  amountCents: number;
  balanceAfterCents: number;
  stripePaymentIntentId?: string;
}) {
  const body = `
    <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#18181b;">Nueva recarga de saldo</p>
    ${statBox([
      { label: "Cliente", value: opts.userEmail },
      { label: "Importe", value: eur(opts.amountCents), emphasis: true },
      { label: "Saldo tras la recarga", value: eur(opts.balanceAfterCents) },
      { label: "ID de usuario", value: opts.userId },
      ...(opts.stripePaymentIntentId ? [{ label: "Pago en Stripe", value: opts.stripePaymentIntentId }] : []),
      { label: "Fecha", value: new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) },
    ])}
  `;
  await sendMail({
    to: SUPPORT_EMAIL,
    subject: `Recarga de saldo — ${opts.userEmail} — ${eur(opts.amountCents)}`,
    html: emailLayout({ product: "Etiqueta Live", bodyHtml: body }),
  });
}
