import { LegalPageShell } from "@/components/legal-page-shell";
import { useUiLocale } from "@/lib/ui-locale";

export default function LegalPrivacyPage() {
  const { locale } = useUiLocale();
  return (
    <LegalPageShell title={locale === "es" ? "Política de privacidad" : "Privacy Policy"}>
      {locale === "es" ? (
        <>
          <h2>1. Responsable del tratamiento</h2>
          <p>
            El responsable del tratamiento de los datos personales obtenidos a traves de Vesta AI es{" "}
            <strong>Dev AI LTD</strong>, sociedad de responsabilidad limitada (Limited Liability Company) bajo la
            legislacion de Bulgaria.
          </p>
          <p>
            <strong>Domicilio social y direccion de gestion:</strong> Bulgaria, Provincia de Ruse, 7002 Ruse,
            Municipio de Ruse, calle Bogdan Voyvoda n.º 1.
          </p>
          <p>
            <strong>Identificacion de la entidad (Bulgaria, ЕИК/ПИК):</strong> 208553841
          </p>
          <p>
            No hemos designado un delegado de proteccion de datos (DPD). Para ejercer tus derechos o consultas de
            privacidad, utiliza el contacto indicado en la seccion 8.
          </p>

          <h2>2. Que datos recopilamos</h2>
          <ul>
            <li>Datos de cuenta: por ejemplo, usuario, correo electronico, contrasena (almacenada de forma segura).</li>
            <li>Datos de uso: por ejemplo, propiedades guardadas, pedidos y contenido necesario para generar informes.</li>
            <li>Datos de pago: procesados por un proveedor de pagos (por ejemplo, Stripe); normalmente no almacenamos el numero completo de tarjeta en nuestros servidores.</li>
            <li>Datos tecnicos: por ejemplo, logs minimos necesarios para seguridad y funcionamiento del servicio.</li>
          </ul>

          <h2>3. Finalidades y bases legales</h2>
          <p>
            Tratamos los datos para ejecutar el contrato contigo, por intereses legitimos (seguridad, mejora del
            servicio) y, cuando sea necesario, por consentimiento (por ejemplo, comunicaciones de marketing).
          </p>

          <h2>4. Destinatarios y transferencias</h2>
          <p>
            Podemos compartir datos con proveedores que prestan servicios (hosting, pagos, email, analisis IA),
            dentro de los limites contractuales y legales. Algunos proveedores pueden estar fuera del EEE; en ese
            caso, se aplican garantias adecuadas (por ejemplo, clausulas contractuales tipo).
          </p>

          <h2>5. Plazo de conservacion</h2>
          <p>
            Conservamos los datos durante el tiempo necesario para las finalidades anteriores y segun obligaciones
            legales (por ejemplo, contabilidad).
          </p>

          <h2>6. Tus derechos (RGPD)</h2>
          <p>
            Tienes derecho de acceso, rectificacion, supresion, limitacion, oposicion y portabilidad, conforme
            a la ley aplicable. Para ejercer estos derechos, escribe a la direccion de la seccion 8. Tambien puedes
            presentar una reclamacion ante la autoridad de control de tu pais de residencia (por ejemplo, la AEPD
            en Espana si te aplica).
          </p>

          <h2>7. Seguridad</h2>
          <p>
            Aplicamos medidas tecnicas y organizativas razonables; sin embargo, ningun sistema es 100% seguro.
          </p>

          <h2>8. Contacto (privacidad y derechos)</h2>
          <p>
            <a className="underline underline-offset-2" href="mailto:contact@devaieood.com">
              contact@devaieood.com
            </a>
          </p>
          <p>
            Direccion postal: Bogdan Voyvoda n.º 1, 7002 Ruse, Municipio de Ruse, Provincia de Ruse, Bulgaria.
          </p>

          <h2>9. Cambios</h2>
          <p>
            Actualizaremos esta politica cuando sea necesario y te informaremos por medios razonables si la ley lo exige.
          </p>
        </>
      ) : (
        <>
          <h2>1. Data controller</h2>
          <p>
            The controller of personal data collected through Vesta AI is{" "}
            <strong>Dev AI LTD</strong>, a limited liability company incorporated under the laws of Bulgaria.
          </p>
          <p>
            <strong>Registered office and management address:</strong> Bulgaria, Ruse Province, 7002 Ruse, Ruse
            Municipality, Bogdan Voyvoda Street No. 1.
          </p>
          <p>
            <strong>Company identification (Bulgaria, ЕИК/ПИК):</strong> 208553841
          </p>
          <p>
            We have not appointed a Data Protection Officer (DPO). For privacy requests or to exercise your
            rights, use the contact in section 8.
          </p>

          <h2>2. What data we collect</h2>
          <ul>
            <li>Account data: e.g., username, email address, password (stored securely).</li>
            <li>Usage data: e.g., saved properties, orders, content needed to generate reports.</li>
            <li>Payment data: processed by a payment processor (e.g., Stripe); we do not normally store full card numbers on our servers.</li>
            <li>Technical data: e.g., minimal logs needed for security and service operation.</li>
          </ul>

          <h2>3. Purposes and legal bases</h2>
          <p>
            We process data to perform our contract with you, for legitimate interests (security, service
            improvement), and where necessary, based on consent (e.g., marketing communications, if used).
          </p>

          <h2>4. Recipients and transfers</h2>
          <p>
            We may share data with providers who deliver services to us (hosting, payments, email, AI
            analysis), within contractual and legal limits. Some providers may be outside the EEA; in this
            case, appropriate safeguards apply (e.g., standard contractual clauses).
          </p>

          <h2>5. Retention period</h2>
          <p>
            We keep data for as long as necessary for the purposes above and in accordance with legal
            obligations (e.g., accounting).
          </p>

          <h2>6. Your rights (GDPR)</h2>
          <p>
            You have the right of access, rectification, erasure, restriction, objection, and portability,
            under applicable law. To exercise these rights, write to the address in section 8. You also have the
            right to lodge a complaint with a supervisory authority in your country of residence (for example,
            the AEPD in Spain, where relevant).
          </p>

          <h2>7. Security</h2>
          <p>
            We implement reasonable technical and organizational measures; however, no system is 100% secure.
          </p>

          <h2>8. Contact (privacy and rights)</h2>
          <p>
            <a className="underline underline-offset-2" href="mailto:contact@devaieood.com">
              contact@devaieood.com
            </a>
          </p>
          <p>
            Postal address: Bogdan Voyvoda Street No. 1, 7002 Ruse, Ruse Municipality, Ruse Province, Bulgaria.
          </p>

          <h2>9. Changes</h2>
          <p>
            We will update this policy when necessary and inform you through reasonable means if required by law.
          </p>
        </>
      )}
    </LegalPageShell>
  );
}
