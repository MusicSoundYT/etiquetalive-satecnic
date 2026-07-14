import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Política de cookies · Etiqueta Live" };

export default function CookiesPage() {
  return (
    <LegalPage title="Política de cookies">
      <p>
        Una cookie es un pequeño archivo que se almacena en tu navegador al visitar una web. Esta
        página explica qué cookies utiliza Etiqueta Live y para qué.
      </p>

      <h2>Cookies que utilizamos</h2>
      <p>
        Etiqueta Live únicamente utiliza cookies <strong>técnicas o necesarias</strong>,
        imprescindibles para que puedas iniciar sesión y navegar por el panel de forma segura:
      </p>
      <ul>
        <li>
          <strong>el_session</strong> — mantiene tu sesión iniciada tras el login
        </li>
        <li>
          <strong>el_mfa_challenge</strong> — recuerda que estás completando la verificación en dos
          pasos (MFA) durante el proceso de inicio de sesión
        </li>
      </ul>
      <p>
        Estas cookies están exentas del deber de solicitar consentimiento conforme al artículo 22.2
        de la LSSI y a la guía de la Agencia Española de Protección de Datos, ya que son
        estrictamente necesarias para prestar el servicio que solicitas expresamente.
      </p>

      <h2>Cookies que NO utilizamos</h2>
      <p>
        No utilizamos cookies de analítica, publicidad, redes sociales ni de seguimiento de
        terceros. No hacemos perfilado publicitario de tus visitas.
      </p>

      <h2>Cómo desactivar las cookies</h2>
      <p>
        Puedes configurar tu navegador para bloquear o eliminar cookies. Ten en cuenta que, al ser
        cookies estrictamente necesarias, si las bloqueas no podrás iniciar sesión ni usar el
        Servicio.
      </p>
    </LegalPage>
  );
}
