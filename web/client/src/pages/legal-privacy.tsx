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
            El responsable del tratamiento de datos personales en Vesta AI debe identificarse aqui de forma
            completa (nombre, direccion, contacto DPO o persona designada, si aplica).
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
            a la ley aplicable. Para ejercer estos derechos, contacta al responsable. Tambien puedes presentar
            una reclamacion ante la autoridad de control de tu pais de residencia.
          </p>

          <h2>7. Seguridad</h2>
          <p>
            Aplicamos medidas tecnicas y organizativas razonables; sin embargo, ningun sistema es 100% seguro.
          </p>

          <h2>8. Cambios</h2>
          <p>
            Actualizaremos esta politica cuando sea necesario y te informaremos por medios razonables si la ley lo exige.
          </p>
        </>
      ) : (
        <>
          <h2>1. Data controller</h2>
          <p>
            The data controller processing personal data through Vesta AI must be fully identified here
            (name, address, DPO contact or designated person, if applicable).
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
            under applicable law. To exercise these rights, contact the controller. You also have the right
            to lodge a complaint with a supervisory authority in your country of residence.
          </p>

          <h2>7. Security</h2>
          <p>
            We implement reasonable technical and organizational measures; however, no system is 100% secure.
          </p>

          <h2>8. Changes</h2>
          <p>
            We will update this policy when necessary and inform you through reasonable means if required by law.
          </p>
        </>
      )}
    </LegalPageShell>
  );
}
