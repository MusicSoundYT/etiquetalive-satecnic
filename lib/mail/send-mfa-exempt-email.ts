import "server-only";
import { sendMail } from "@/lib/mail/transport";

/** Aviso de transparencia: un administrador ha activado/desactivado la exención de MFA de esta cuenta. */
export async function sendMfaExemptEmail(to: string, exempt: boolean) {
  await sendMail({
    to,
    subject: exempt
      ? "Se ha desactivado el requisito de verificación en dos pasos en tu cuenta"
      : "Se ha reactivado el requisito de verificación en dos pasos en tu cuenta",
    html: exempt
      ? `
        <p>Un administrador de Etiqueta Live ha desactivado, a petición tuya o de tu negocio, el requisito de verificación en dos pasos (MFA) para tu cuenta.</p>
        <p>A partir de ahora podrás iniciar sesión solo con tu email y contraseña.</p>
        <p><strong>Si no lo esperabas, contacta con soporte de inmediato.</strong></p>
      `
      : `
        <p>Un administrador de Etiqueta Live ha reactivado el requisito de verificación en dos pasos (MFA) para tu cuenta.</p>
        <p>En tu próximo inicio de sesión se te pedirá de nuevo el código de verificación.</p>
      `,
  });
}
