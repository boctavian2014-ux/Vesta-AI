import { useUiLocale } from "@/lib/ui-locale";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { locale, setLocale } = useUiLocale();

  return (
    <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
      <Button
        variant={locale === "en" ? "default" : "ghost"}
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setLocale("en")}
      >
        EN
      </Button>
      <Button
        variant={locale === "es" ? "default" : "ghost"}
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setLocale("es")}
      >
        ES
      </Button>
    </div>
  );
}
