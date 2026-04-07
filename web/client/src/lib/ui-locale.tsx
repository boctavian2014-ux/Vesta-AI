import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { detectBrowserLocale } from "@/lib/locale";

export type UiLocale = "en" | "es";

type UiLocaleContextValue = {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
};

const STORAGE_KEY = "vesta-ui-locale";

const UiLocaleContext = createContext<UiLocaleContextValue | null>(null);

function detectInitialLocale(): UiLocale {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  }
  return detectBrowserLocale() === "es" ? "es" : "en";
}

export function UiLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(() => detectInitialLocale());

  const setLocale = (next: UiLocale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  };

  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <UiLocaleContext.Provider value={value}>{children}</UiLocaleContext.Provider>;
}

export function useUiLocale() {
  const ctx = useContext(UiLocaleContext);
  if (!ctx) throw new Error("useUiLocale must be used inside UiLocaleProvider");
  return ctx;
}
