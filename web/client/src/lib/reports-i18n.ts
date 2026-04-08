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
    statusCompleted: string;
    statusFailed: string;
    typeAnalysisPack: string;
    typeNotaSimple: string;
    typeExpertReport: string;
    countProcessing: string;
    countPending: string;
    countCompleted: string;
    countFailed: string;
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
    statusCompleted: "Completed",
    statusFailed: "Failed",
    typeAnalysisPack: "Property + financial analysis",
    typeNotaSimple: "Nota Simple",
    typeExpertReport: "Expert report",
    countProcessing: "processing",
    countPending: "pending",
    countCompleted: "completed",
    countFailed: "failed",
  },
  ro: {
    reportsTitle: "Rapoarte",
    reportsSubtitleLoading: "Rapoartele tale pentru proprietăți",
    reportsCount: "rapoarte comandate",
    reportsCountOne: "raport comandat",
    emptyTitle: "Încă nu ai rapoarte",
    emptyDescription:
      "Comandă primul raport pentru o proprietate analizând-o pe hartă.",
    analyzeProperty: "Analizează o proprietate",
    statusPending: "În așteptare",
    statusProcessing: "În procesare",
    statusCompleted: "Finalizat",
    statusFailed: "Eșuat",
    typeAnalysisPack: "Analiză proprietate + financiară",
    typeNotaSimple: "Nota Simple",
    typeExpertReport: "Raport expert",
    countProcessing: "în procesare",
    countPending: "în așteptare",
    countCompleted: "finalizate",
    countFailed: "eșuate",
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
    statusCompleted: "Completado",
    statusFailed: "Fallido",
    typeAnalysisPack: "Analisis de propiedad + financiero",
    typeNotaSimple: "Nota Simple",
    typeExpertReport: "Informe experto",
    countProcessing: "en proceso",
    countPending: "pendientes",
    countCompleted: "completados",
    countFailed: "fallidos",
  },
  de: {
    reportsTitle: "Berichte",
    reportsSubtitleLoading: "Ihre Immobilienberichte",
    reportsCount: "bestellte Berichte",
    reportsCountOne: "bestellter Bericht",
    emptyTitle: "Noch keine Berichte",
    emptyDescription:
      "Bestellen Sie Ihren ersten Bericht, indem Sie eine Immobilie auf der Karte analysieren.",
    analyzeProperty: "Immobilie analysieren",
    statusPending: "Ausstehend",
    statusProcessing: "In Bearbeitung",
    statusCompleted: "Abgeschlossen",
    statusFailed: "Fehlgeschlagen",
    typeAnalysisPack: "Objekt- und Finanzanalyse",
    typeNotaSimple: "Nota Simple",
    typeExpertReport: "Expertenbericht",
    countProcessing: "in Bearbeitung",
    countPending: "ausstehend",
    countCompleted: "abgeschlossen",
    countFailed: "fehlgeschlagen",
  },
};

export function getReportsStrings(locale?: AppLocale) {
  const loc = locale ?? detectBrowserLocale();
  return STRINGS[loc];
}
