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
    reportsTitle: "Property reports",
    reportsSubtitleLoading: "Register of commissioned reports",
    reportsCount: "entries in register",
    reportsCountOne: "entry in register",
    emptyTitle: "No reports on file",
    emptyDescription:
      "Commission a report by running a property analysis from the map.",
    analyzeProperty: "Open property analysis",
    reportDemoBadge: "Demonstration · no fee",
    statusPending: "Pending",
    statusProcessing: "In progress",
    statusPaid: "Paid",
    statusSubmittedManual: "Request transmitted",
    statusWaitingPartner: "Awaiting land registry extract",
    statusPdfReceived: "PDF on file",
    statusCompleted: "Closed",
    statusFailed: "Unsuccessful",
    statusFailedRefundable: "Unsuccessful (refundable)",
    typeAnalysisPack: "Standard analysis package (15 €)",
    typeNotaSimple: "Land registry extract (Nota Simple)",
    typeExpertReport: "Extended expert file with land registry extract (50 €)",
    typeGenericPropertyReport: "Property report",
    countProcessing: "in progress",
    countPending: "pending",
    countPaid: "paid",
    countSubmittedManual: "transmitted",
    countWaitingPartner: "awaiting extract",
    countPdfReceived: "PDF on file",
    countCompleted: "closed",
    countFailed: "unsuccessful",
    countFailedRefundable: "unsuccessful (refundable)",
  },
  es: {
    reportsTitle: "Informes de propiedad",
    reportsSubtitleLoading: "Registro de informes solicitados",
    reportsCount: "asientos en el registro",
    reportsCountOne: "asiento en el registro",
    emptyTitle: "Sin informes en expediente",
    emptyDescription:
      "Solicite un informe mediante el análisis de una finca en el mapa.",
    analyzeProperty: "Acceder al análisis de finca",
    reportDemoBadge: "Consulta demostrativa · sin cargo",
    statusPending: "Pendiente",
    statusProcessing: "En tramitación",
    statusPaid: "Pagado",
    statusSubmittedManual: "Solicitud remitida",
    statusWaitingPartner: "En espera de Nota Simple registral",
    statusPdfReceived: "PDF incorporado al expediente",
    statusCompleted: "Cerrado",
    statusFailed: "Sin efecto",
    statusFailedRefundable: "Sin efecto (reembolsable)",
    typeAnalysisPack: "Paquete de análisis ordinario (15 €)",
    typeNotaSimple: "Extracto registral (Nota Simple)",
    typeExpertReport: "Expediente experto ampliado con Nota Simple (50 €)",
    typeGenericPropertyReport: "Informe de propiedad",
    countProcessing: "en tramitación",
    countPending: "pendientes",
    countPaid: "pagados",
    countSubmittedManual: "remitidos",
    countWaitingPartner: "en espera de extracto",
    countPdfReceived: "PDF incorporado",
    countCompleted: "cerrados",
    countFailed: "sin efecto",
    countFailedRefundable: "sin efecto (reembolsables)",
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
