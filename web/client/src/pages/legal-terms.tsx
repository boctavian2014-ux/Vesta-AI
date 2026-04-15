import { LegalPageShell } from "@/components/legal-page-shell";
import { useUiLocale } from "@/lib/ui-locale";

export default function LegalTermsPage() {
  const { locale } = useUiLocale();
  return (
    <LegalPageShell title={locale === "es" ? "Términos y condiciones de uso" : "Terms and Conditions of Use"}>
      {locale === "es" ? (
        <>
          <h2>1. Operador</h2>
          <p>
            Los servicios disponibles en la aplicacion Vesta AI son prestados por el operador de la plataforma
            ("nosotros" / "Vesta"). Los datos completos de identificacion de la entidad legal deben completarse
            aqui antes de publicar.
          </p>

          <h2>2. Descripcion de los servicios</h2>
          <p>
            La plataforma ofrece herramientas de analisis e informacion inmobiliaria (por ejemplo, datos
            catastrales, tendencias de mercado) y puede incluir opciones para solicitar documentos o informes
            (incluyendo Nota Simple e informes asistidos por IA), en la medida en que esten disponibles.
          </p>
          <p>
            Algunas entregas dependen de terceros (por ejemplo, registro, colaboradores autorizados, proveedores
            de datos). Los plazos y la disponibilidad pueden variar; no garantizamos un resultado especifico fuera
            de las obligaciones legales aplicables.
          </p>

          <h2>3. Cuenta y acceso</h2>
          <p>
            Crear una cuenta puede ser necesario para funciones guardadas y pagos. Eres responsable de mantener
            la confidencialidad de las credenciales y de la exactitud de los datos proporcionados.
          </p>

          <h2>4. Pagos</h2>
          <p>
            Los pagos pueden procesarse mediante proveedores terceros (por ejemplo, Stripe). Los precios mostrados
            son los vigentes en el momento del pedido. La facturacion y el IVA (si aplica) se rigen por la ley
            aplicable y la politica del operador.
          </p>

          <h2>5. Reembolsos y retrasos</h2>
          <p>
            Las condiciones de cancelacion, derecho de desistimiento (cuando aplique al consumidor) y reembolsos
            se determinan segun la ley aplicable y se detallaran en la version final de este documento. Pueden
            producirse retrasos por terceros (registro, mensajeria electronica); te informaremos razonablemente del
            estado del pedido dentro de las limitaciones tecnicas.
          </p>

          <h2>6. Limitacion de responsabilidad</h2>
          <p>
            La informacion y los informes tienen caracter informativo y no sustituyen asesoramiento legal, fiscal
            o de inversion. En la medida permitida por la ley, se excluyen ciertos danos indirectos o
            consecuenciales.
          </p>

          <h2>7. Cambios</h2>
          <p>
            Podemos actualizar estos terminos; la version vigente es la publicada en la aplicacion, con su fecha
            de ultima actualizacion.
          </p>

          <h2>8. Contacto</h2>
          <p>Anade aqui un email y, opcionalmente, direccion postal para solicitudes relacionadas con estos terminos.</p>
        </>
      ) : (
        <>
          <h2>1. Operator</h2>
          <p>
            The services available through the Vesta AI application are provided by the platform operator
            ("we" / "Vesta"). The full legal entity identification details should be completed here before
            publication.
          </p>

          <h2>2. Service description</h2>
          <p>
            The platform provides property analysis and information tools (e.g., cadastral data, market
            trends) and may include options to order documents or reports (including Nota Simple and
            AI-assisted reports), to the extent available in the interface.
          </p>
          <p>
            Certain deliveries depend on third parties (e.g., registry offices, authorized collaborators,
            data providers). Timelines and availability may vary; we do not guarantee a specific result
            beyond applicable legal obligations.
          </p>

          <h2>3. Account and access</h2>
          <p>
            Creating an account may be required for saved features and payments. You are responsible for
            keeping authentication credentials confidential and for the accuracy of the data you provide.
          </p>

          <h2>4. Payments</h2>
          <p>
            Payments may be processed through third-party providers (e.g., Stripe). Displayed prices are
            valid at the time of order. Invoicing and VAT (where applicable) are governed by applicable law
            and operator policy.
          </p>

          <h2>5. Refunds and delays</h2>
          <p>
            Cancellation terms, right of withdrawal (where applicable to consumers), and refunds are
            determined by applicable law and will be detailed in the final version of this document.
            Delays caused by third parties (registry, electronic couriers) may occur; you will be reasonably
            informed about order status within technical limitations.
          </p>

          <h2>6. Limitation of liability</h2>
          <p>
            Information and reports are for informational purposes and do not replace legal, tax, or
            investment advice. To the extent permitted by law, certain indirect or consequential damages are
            excluded.
          </p>

          <h2>7. Changes</h2>
          <p>
            We may update these terms; the version in force is the one published in the application, with
            the latest update date.
          </p>

          <h2>8. Contact</h2>
          <p>Add your email and, optionally, postal address for terms-related requests.</p>
        </>
      )}
    </LegalPageShell>
  );
}
