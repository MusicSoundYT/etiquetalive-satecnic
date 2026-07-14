import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Política de privacidad · Etiqueta Live" };

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad">
      <p>
        En Etiqueta Live tratamos datos personales conforme al Reglamento (UE) 2016/679 (RGPD) y a
        la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos
        digitales (LOPDGDD). Esta política explica qué datos tratamos, con qué finalidad y qué
        derechos tienes.
      </p>

      <h2>Responsable del tratamiento</h2>
      <ul>
        <li><strong>Razón social:</strong> UCKY BARNAVIT, S.L. (N.I.F. B-05380084)</li>
        <li>
          <strong>Domicilio:</strong> Carrer Liszt, 11, 08923 Santa Coloma de Gramenet (Barcelona)
        </li>
        <li><strong>Contacto para ejercicio de derechos:</strong> etiquetalive@woow.tienda</li>
      </ul>

      <h2>Dos roles distintos: tus datos y los datos de tus compradores</h2>
      <p>
        Si eres usuario registrado de Etiqueta Live, somos <strong>responsables del tratamiento</strong>{" "}
        de tus propios datos (cuenta, facturación, uso del Servicio). Sin embargo, cuando la
        extensión detecta un pedido en tu directo de TikTok, se registran también datos de tu
        comprador (nombre de usuario, importe, fecha) que tú necesitas para poder enviarle su
        pedido. Respecto a esos datos de tus compradores, actuamos como{" "}
        <strong>encargados del tratamiento</strong> por cuenta tuya: tú decides qué datos
        introduces en la plataforma y eres responsable de contar con base legítima para tratarlos e
        informar a tus propios clientes según corresponda.
      </p>

      <h2>Datos que tratamos</h2>
      <ul>
        <li>
          <strong>Identificación y contacto:</strong> nombre, apellidos, email, contraseña
          (almacenada cifrada, nunca en texto plano)
        </li>
        <li>
          <strong>Datos de facturación:</strong> razón social, N.I.F., dirección fiscal, si los
          facilitas para la emisión de facturas
        </li>
        <li>
          <strong>Datos de pago:</strong> gestionados directamente por Stripe, nuestro procesador
          de pagos; nunca almacenamos el número completo de tu tarjeta en nuestros servidores
        </li>
        <li>
          <strong>Datos de uso del Servicio:</strong> pedidos detectados, etiquetas impresas,
          plantillas configuradas, saldo y movimientos de tu monedero
        </li>
        <li>
          <strong>Datos técnicos:</strong> dirección IP, tipo de navegador, registros de acceso y
          seguridad (p. ej. intentos de inicio de sesión), con fines de seguridad y prevención de
          fraude
        </li>
      </ul>

      <h2>Finalidades y base legal</h2>
      <ul>
        <li>Gestionar tu cuenta y prestarte el Servicio — ejecución del contrato (art. 6.1.b RGPD)</li>
        <li>
          Procesar pagos, recargas y autorecargas de saldo — ejecución del contrato y, en su caso,
          el consentimiento que otorgas al guardar una tarjeta
        </li>
        <li>
          Emitir facturas y cumplir obligaciones fiscales y contables — obligación legal (art.
          6.1.c RGPD)
        </li>
        <li>
          Seguridad de la cuenta (verificación en dos pasos, límites de intentos, registro de
          sesiones) y prevención de fraude — interés legítimo (art. 6.1.f RGPD)
        </li>
        <li>Responder a tus consultas y darte soporte — ejecución del contrato / interés legítimo</li>
      </ul>

      <h2>Destinatarios y encargados del tratamiento</h2>
      <p>Para prestar el Servicio compartimos datos, en la medida estrictamente necesaria, con:</p>
      <ul>
        <li>
          <strong>Supabase, Inc.</strong> — alojamiento de la base de datos, en infraestructura
          ubicada en la Unión Europea (región eu-west-1, Irlanda)
        </li>
        <li>
          <strong>Stripe Payments Europe, Ltd.</strong> — procesamiento de pagos con tarjeta.
          Stripe puede transferir datos fuera del Espacio Económico Europeo bajo garantías
          adecuadas (cláusulas contractuales tipo de la Comisión Europea)
        </li>
        <li>
          <strong>Proveedor de correo electrónico (Strato)</strong> — envío de emails
          transaccionales (recuperación de contraseña, notificaciones de cuenta)
        </li>
      </ul>
      <p>No cedemos tus datos a terceros con fines publicitarios ni los vendemos.</p>

      <h2>Plazo de conservación</h2>
      <p>
        Conservamos tus datos mientras mantengas una cuenta activa. Tras la baja, conservamos los
        datos de facturación durante el plazo exigido por la normativa mercantil y fiscal española
        (con carácter general, 6 años). El resto de datos se suprimen o anonimizan salvo que exista
        obligación legal de conservarlos por más tiempo.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión,
        oposición, limitación del tratamiento y portabilidad escribiendo a{" "}
        <strong>etiquetalive@woow.tienda</strong>, indicando el derecho que deseas ejercer y
        adjuntando copia de un documento que acredite tu identidad. También tienes derecho a
        presentar una reclamación ante la Agencia Española de Protección de Datos (
        <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
          www.aepd.es
        </a>
        ) si consideras que el tratamiento no se ajusta a la normativa.
      </p>

      <h2>Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas apropiadas: cifrado de contraseñas, cifrado en
        tránsito (HTTPS), verificación en dos pasos (MFA) y control de acceso basado en cuentas y
        permisos.
      </p>

      <h2>Menores de edad</h2>
      <p>El Servicio está dirigido a profesionales y no está destinado a menores de 18 años.</p>
    </LegalPage>
  );
}
