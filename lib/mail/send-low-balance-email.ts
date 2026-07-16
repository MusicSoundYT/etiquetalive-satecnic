import "server-only";
import { sendMail } from "@/lib/mail/transport";
import { env } from "@/lib/env";

/** Aviso de seguridad/cobro: el saldo ha llegado al límite negativo permitido y ya no se imprimen etiquetas hasta recargar. */
export async function sendLowBalanceEmail(to: string) {
  await sendMail({
    to,
    subject: "Recarga tu saldo de Etiqueta Live — impresión pausada",
    html: `
      <p>Tu saldo de Etiqueta Live se ha quedado en negativo y ya no se pueden imprimir más etiquetas hasta que recargues.</p>
      <p><strong>Si no recargas pronto, el servicio quedará suspendido.</strong></p>
      <p><a href="${env.appUrl}/account/recharge">Recarga tu saldo aquí</a> para reactivar la impresión de etiquetas.</p>
    `,
  });
}
