import type { ReactNode } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useUiLocale } from "@/lib/ui-locale";

export function LegalPageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [, navigate] = useHashLocation();
  const { locale, setLocale } = useUiLocale();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-4 w-4" />
          {locale === "es" ? "Volver" : "Back"}
        </Button>
        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5" role="group" aria-label={locale === "es" ? "Idioma" : "Language"}>
          <button
            type="button"
            onClick={() => setLocale("en")}
            className={`rounded px-2 py-1 text-xs font-medium ${locale === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLocale("es")}
            className={`rounded px-2 py-1 text-xs font-medium ${locale === "es" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            ES
          </button>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-8 text-foreground">
        <h1 className="text-2xl font-bold tracking-tight mb-2">{title}</h1>
        <p className="text-xs text-muted-foreground mb-8 border-l-2 border-amber-500/50 pl-3 py-1">
          {locale === "es"
            ? "Texto orientativo (borrador). Sustituir por una versión revisada por un abogado antes de producción."
            : "Guidance text (draft). Replace with a lawyer-reviewed version before production."}
        </p>
        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">
          {children}
        </div>
      </article>
    </div>
  );
}
