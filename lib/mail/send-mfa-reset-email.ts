import "server-only";
import { sendMail } from "@/lib/mail/transport";

/** Aviso de seguridad: se envía siempre que se resetea el MFA de una cuenta, la haya pedido el propio usuario o un administrador. */
export async function sendMfaResetEmail(to: string, opts: { byAdmin: boolean }) {
  await sendMail({
    to,
    subject: "Se ha restablecido tu verificación en dos pasos",
    html: `
      <p>${
        opts.byAdmin
          ? "Un administrador ha restablecido la verificación en dos pasos de tu cuenta de Etiqueta Live."
          : "Se ha restablecido la verificación en dos pasos de tu cuenta de Etiqueta Live."
      }</p>
      <p>Se han cerrado todas las sesiones activas. La próxima vez que inicies sesión deberás configurarla de nuevo (código QR o correo electrónico).</p>
      <p><strong>Si no has sido tú quien lo ha solicitado, cambia tu contraseña de inmediato y contacta con soporte.</strong></p>
    `,
  });
}
