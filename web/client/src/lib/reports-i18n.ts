import { type AppLocale, detectBrowserLocale } from "./locale";

const STRINGS: Record<
  AppLocale,
  {
    reportsTitle: string;
    reportsSubtitleLoading: string;
    reportsCount: string;
    reportsCountOne: string;
    emptyTitle: string;
    emptyDescription: string;
    analyzeProperty: string;
    /** Shown when report was created via “try without paying” / map preview (no Stripe session). */
    reportDemoBadge: string;
    statusPending: string;
    statusProcessing: string;
    statusPaid: string;
    statusSubmittedManual: string;
    statusWaitingPartner: string;
    statusPdfReceived: string;
    statusCompleted: string;
    statusFailed: string;
    statusFailedRefundable: string;
    typeAnalysisPack: string;
    typeNotaSimple: string;
    typeExpertReport: string;
    /** When `report.type` is unknown or legacy. */
    typeGenericPropertyReport: string;
    countProcessing: string;
    countPending: string;
    countPaid: string;
    countSubmittedManual: string;
    countWaitingPartner: string;
    countPdfReceived: string;
    countCompleted: string;
    countFailed: string;
    countFailedRefundable: string;
  }
> = {
  en: {
    reportsTitle: "Reports",
    reportsSubtitleLoading: "Your property reports",
    reportsCount: "reports ordered",
    reportsCountOne: "report ordered",
    emptyTitle: "No reports yet",
    emptyDescription:
      "Order your first property report by analyzing a property on the map.",
    analyzeProperty: "Analyze a property",
    reportDemoBadge: "Preview · no charge",
    statusPending: "Pending",
    statusProcessing: "Processing",
    statusPaid: "Paid",
    statusSubmittedManual: "Request sent",
    statusWaitingPartner: "Awaiting land registry summary",
    statusPdfReceived: "PDF received",
    statusCompleted: "Completed",
    statusFailed: "Failed",
    statusFailedRefundable: "Failed (refundable)",
    typeAnalysisPack: "Analysis pack (15 €)",
    typeNotaSimple: "Land registry summary",
    typeExpertReport: "Expert report + land registry summary (50 €)",
    typeGenericPropertyReport: "Property report",
    countProcessing: "processing",
    countPending: "pending",
    countPaid: "paid",
    countSubmittedManual: "request sent",
    countWaitingPartner: "awaiting land registry summary",
    countPdfReceived: "pdf received",
    countCompleted: "completed",
    countFailed: "failed",
    countFailedRefundable: "failed (refundable)",
  },
  es: {
    reportsTitle: "Informes",
    reportsSubtitleLoading: "Tus informes de propiedades",
    reportsCount: "informes pedidos",
    reportsCountOne: "informe pedido",
    emptyTitle: "Aún no hay informes",
    emptyDescription:
      "Pide tu primer informe analizando una propiedad en el mapa.",
    analyzeProperty: "Analizar una propiedad",
    reportDemoBadge: "Vista previa · sin pago",
    statusPending: "Pendiente",
    statusProcessing: "En proceso",
    statusPaid: "Pagado",
    statusSubmittedManual: "Solicitud enviada",
    statusWaitingPartner: "Esperando Nota Simple",
    statusPdfReceived: "PDF recibido",
    statusCompleted: "Completado",
    statusFailed: "Fallido",
    statusFailedRefundable: "Fallido (reembolsable)",
    typeAnalysisPack: "Paquete de análisis (15 €)",
    typeNotaSimple: "Nota Simple",
    typeExpertReport: "Informe experto con Nota Simple (50 €)",
    typeGenericPropertyReport: "Informe de propiedad",
    countProcessing: "en proceso",
    countPending: "pendientes",
    countPaid: "pagados",
    countSubmittedManual: "solicitud enviada",
    countWaitingPartner: "esperando Nota Simple",
    countPdfReceived: "pdf recibido",
    countCompleted: "completados",
    countFailed: "fallidos",
    countFailedRefundable: "fallidos (reembolsables)",
  },
};

export function getReportsStrings(locale?: AppLocale) {
  const loc = locale ?? detectBrowserLocale();
  return STRINGS[loc];
}

/** Map / sidebar “try without paying” creates rows with this `stripe_session_id` prefix. */
export function isReportDemoPreview(report: { stripeSessionId?: string | null }): boolean {
  const sid = report.stripeSessionId;
  return typeof sid === "string" && sid.startsWith("demo_preview_");
}
