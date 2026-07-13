import "server-only";
import { sendMail } from "@/lib/mail/transport";
import { env } from "@/lib/env";

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to,
    subject: "Recupera tu contraseña de Etiqueta Live",
    html: `
      <p>Has solicitado restablecer tu contraseña de Etiqueta Live.</p>
      <p><a href="${url}">Haz clic aquí para elegir una nueva contraseña</a></p>
      <p>Este enlace caduca en 10 minutos y solo se puede usar una vez.</p>
      <p>Si no has sido tú, puedes ignorar este correo.</p>
    `,
  });
}
