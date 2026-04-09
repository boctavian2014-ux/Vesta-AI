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
    statusPending: string;
    statusProcessing: string;
    statusWaitingPartner: string;
    statusPdfReceived: string;
    statusCompleted: string;
    statusFailed: string;
    statusFailedRefundable: string;
    typeAnalysisPack: string;
    typeNotaSimple: string;
    typeExpertReport: string;
    countProcessing: string;
    countPending: string;
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
    statusPending: "Pending",
    statusProcessing: "Processing",
    statusWaitingPartner: "Waiting partner",
    statusPdfReceived: "PDF received",
    statusCompleted: "Completed",
    statusFailed: "Failed",
    statusFailedRefundable: "Failed (refundable)",
    typeAnalysisPack: "Analysis pack (15€)",
    typeNotaSimple: "Nota Simple",
    typeExpertReport: "Expert report + Nota Simple (50€)",
    countProcessing: "processing",
    countPending: "pending",
    countWaitingPartner: "waiting partner",
    countPdfReceived: "pdf received",
    countCompleted: "completed",
    countFailed: "failed",
    countFailedRefundable: "failed refundable",
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
    statusPending: "Pendiente",
    statusProcessing: "En proceso",
    statusWaitingPartner: "Esperando proveedor",
    statusPdfReceived: "PDF recibido",
    statusCompleted: "Completado",
    statusFailed: "Fallido",
    statusFailedRefundable: "Fallido (reembolsable)",
    typeAnalysisPack: "Paquete analisis (15€)",
    typeNotaSimple: "Nota Simple",
    typeExpertReport: "Informe experto + Nota Simple (50€)",
    countProcessing: "en proceso",
    countPending: "pendientes",
    countWaitingPartner: "esperando proveedor",
    countPdfReceived: "pdf recibido",
    countCompleted: "completados",
    countFailed: "fallidos",
    countFailedRefundable: "fallido reembolsable",
  },
};

export function getReportsStrings(locale?: AppLocale) {
  const loc = locale ?? detectBrowserLocale();
  return STRINGS[loc];
}
