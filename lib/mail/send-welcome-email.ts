import "server-only";
import { sendMail } from "@/lib/mail/transport";
import { env } from "@/lib/env";

/** Cuenta creada manualmente por un administrador: reutiliza el mismo enlace de un solo uso que "olvidé mi contraseña" para que el cliente establezca su contraseña inicial. */
export async function sendWelcomeEmail(to: string, token: string) {
  const url = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to,
    subject: "Bienvenido a Etiqueta Live — configura tu cuenta",
    html: `
      <p>Se ha creado tu cuenta de Etiqueta Live.</p>
      <p><a href="${url}">Haz clic aquí para elegir tu contraseña</a> y empezar a usarla.</p>
      <p>Este enlace caduca en 10 minutos y solo se puede usar una vez. Si caduca, puedes pedir uno nuevo desde "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión, usando este mismo email.</p>
    `,
  });
}
