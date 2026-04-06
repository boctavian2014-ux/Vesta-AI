/**
 * Limbi aliniate cu expert_report.py (en | ro | es | de).
 * Folosit pentru output_language la plată expert și pentru stringuri UI.
 */
export const APP_LOCALES = ["en", "ro", "es", "de"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === "undefined") return "en";
  const primary = (navigator.language || "en").toLowerCase().split("-")[0].split("_")[0];
  if (primary === "ro" || primary === "es" || primary === "de" || primary === "en") {
    return primary;
  }
  return "en";
}
