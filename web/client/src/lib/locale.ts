/**
 * UI locales supported in web app.
 */
export const APP_LOCALES = ["en", "es"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === "undefined") return "en";
  const primary = (navigator.language || "en").toLowerCase().split("-")[0].split("_")[0];
  if (primary === "es" || primary === "en") {
    return primary;
  }
  return "en";
}
