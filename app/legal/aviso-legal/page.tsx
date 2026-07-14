import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Aviso legal · Etiqueta Live" };

export default function AvisoLegalPage() {
  return (
    <LegalPage title="Aviso legal">
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la
        Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de los
        siguientes datos:
      </p>

      <h2>Titular del sitio web</h2>
      <ul>
        <li><strong>Razón social:</strong> LUCKY BARNAVIT, S.L.</li>
        <li><strong>N.I.F.:</strong> B-05380084</li>
        <li>
          <strong>Domicilio social:</strong> Carrer Liszt, 11, 08923 Santa Coloma de Gramenet
          (Barcelona), España
        </li>
        <li><strong>Contacto:</strong> etiquetalive@woow.tienda</li>
        <li>
          <strong>Actividad:</strong> prestación de un servicio (SaaS) de gestión e impresión de
          etiquetas para pedidos generados durante retransmisiones en directo (TikTok Live)
        </li>
      </ul>

      <h2>Objeto</h2>
      <p>
        Etiqueta Live (en adelante, &quot;el Servicio&quot;) es una plataforma web, junto con una
        extensión de navegador Chrome, que permite a sus usuarios detectar pedidos generados en
        directos de TikTok e imprimir etiquetas de envío asociadas a dichos pedidos.
      </p>

      <h2>Condiciones de uso</h2>
      <p>
        El acceso y/o uso de este sitio web atribuye la condición de usuario y supone la
        aceptación, desde dicho acceso y/o uso, de las condiciones generales incluidas en este
        Aviso Legal, en la <a href="/legal/terminos">Política de Términos y Condiciones</a>, en la{" "}
        <a href="/legal/privacidad">Política de Privacidad</a> y en la{" "}
        <a href="/legal/cookies">Política de Cookies</a>.
      </p>

      <h2>Propiedad intelectual e industrial</h2>
      <p>
        Todos los contenidos del sitio web, incluyendo a título enunciativo y no limitativo su
        programación, edición, compilación, diseño, logotipos, texto y/o gráficos, son propiedad de
        LUCKY BARNAVIT, S.L. o, en su caso, dispone de licencia o autorización expresa de los
        autores. Queda prohibida su reproducción, distribución o comunicación pública total o
        parcial sin autorización expresa.
      </p>

      <h2>Exclusión de responsabilidad</h2>
      <p>
        LUCKY BARNAVIT, S.L. no se hace responsable de la veracidad de los datos de pedidos
        detectados automáticamente por la extensión desde plataformas de terceros (TikTok), ni de
        interrupciones del Servicio derivadas de causas ajenas a su control, incluyendo cambios en
        dichas plataformas de terceros.
      </p>

      <h2>Legislación aplicable y jurisdicción</h2>
      <p>
        Las presentes condiciones se rigen por la legislación española. Para la resolución de
        cualquier controversia, y sin perjuicio de los fueros que pudieran corresponder a los
        consumidores conforme a la normativa vigente, las partes se someten a los Juzgados y
        Tribunales de Barcelona.
      </p>
    </LegalPage>
  );
}
