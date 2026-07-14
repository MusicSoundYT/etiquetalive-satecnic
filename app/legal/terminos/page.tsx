import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Términos y condiciones · Etiqueta Live" };

export default function TerminosPage() {
  return (
    <LegalPage title="Términos y condiciones">
      <h2>1. Objeto</h2>
      <p>
        Estas condiciones regulan el uso de Etiqueta Live, un servicio (SaaS) prestado por LUCKY
        BARNAVIT, S.L. (N.I.F. B-05380084, domicilio en Carrer Liszt, 11, 08923 Santa Coloma de
        Gramenet, Barcelona) que permite detectar pedidos generados en directos de TikTok e
        imprimir etiquetas de envío, mediante una extensión de navegador y un panel web.
      </p>

      <h2>2. Registro y cuenta</h2>
      <p>
        Para usar el Servicio debes crear una cuenta aportando datos veraces y mantener la
        confidencialidad de tu contraseña. Recomendamos y facilitamos la activación de
        verificación en dos pasos (MFA). Eres responsable de toda actividad realizada desde tu
        cuenta y de la clave de API que uses en la extensión de Chrome.
      </p>

      <h2>3. Descripción del Servicio</h2>
      <p>
        La extensión de Chrome detecta pedidos en las páginas de TikTok Seller/Live y los envía al
        panel, donde puedes generar e imprimir etiquetas según la plantilla que configures.
      </p>

      <h2>4. Precios y facturación</h2>
      <ul>
        <li>
          El Servicio se factura por etiqueta impresa, con un precio por etiqueta que depende de tu
          rango de uso (tramo/tier), visible en tu panel de Configuración.
        </li>
        <li>
          La primera impresión de una etiqueta se cobra de tu saldo; las reimpresiones posteriores
          de la misma etiqueta no generan un nuevo cobro.
        </li>
        <li>
          Puedes recargar tu saldo manualmente o activar la autorecarga, que añadirá saldo
          automáticamente con la tarjeta que hayas guardado cuando tu saldo baje de un umbral
          determinado. Todos los cobros se procesan a través de Stripe.
        </li>
        <li>Los precios indicados no incluyen impuestos aplicables, que se añadirán conforme a la normativa vigente.</li>
      </ul>

      <h2>5. Obligaciones del usuario</h2>
      <p>
        Te comprometes a usar el Servicio conforme a la ley, a no introducir datos que no tengas
        derecho a tratar, y a ser responsable, como responsable del tratamiento, de los datos de
        tus propios compradores que gestionas a través de la plataforma (ver{" "}
        <a href="/legal/privacidad">Política de Privacidad</a>).
      </p>

      <h2>6. Propiedad intelectual</h2>
      <p>
        El software, diseño y marca de Etiqueta Live son titularidad de LUCKY BARNAVIT, S.L. Se te
        concede una licencia de uso no exclusiva e intransferible, limitada a la duración de tu
        cuenta.
      </p>

      <h2>7. Disponibilidad del Servicio</h2>
      <p>
        Procuramos la máxima disponibilidad del Servicio, pero no garantizamos un funcionamiento
        ininterrumpido, ya que depende en parte de plataformas de terceros (TikTok) ajenas a
        nuestro control, y puede requerir mantenimientos programados.
      </p>

      <h2>8. Responsabilidad</h2>
      <p>
        LUCKY BARNAVIT, S.L. no será responsable de daños indirectos o lucro cesante derivados del
        uso o imposibilidad de uso del Servicio, ni de errores en los datos detectados
        automáticamente desde plataformas de terceros.
      </p>

      <h2>9. Duración y baja</h2>
      <p>
        Puedes darte de baja del Servicio en cualquier momento. El saldo no consumido no es
        reembolsable salvo que la normativa de consumidores aplicable disponga lo contrario.
      </p>

      <h2>10. Modificaciones</h2>
      <p>
        Podemos modificar estas condiciones o los precios del Servicio. Te informaremos de
        cualquier cambio relevante con antelación razonable a través del email asociado a tu
        cuenta.
      </p>

      <h2>11. Legislación aplicable</h2>
      <p>
        Estas condiciones se rigen por la legislación española, con sometimiento a los Juzgados y
        Tribunales de Barcelona, sin perjuicio de los fueros que correspondan a los consumidores.
      </p>
    </LegalPage>
  );
}
