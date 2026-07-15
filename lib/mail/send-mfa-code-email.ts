import "server-only";
import { sendMail } from "@/lib/mail/transport";

export async function sendMfaCodeEmail(to: string, code: string) {
  await sendMail({
    to,
    subject: "Tu código de verificación de Etiqueta Live",
    html: `
      <p>Tu código de verificación es:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${code}</p>
      <p>Caduca en 5 minutos y solo se puede usar una vez.</p>
      <p>Si no has sido tú, puedes ignorar este correo.</p>
    `,
  });
}
