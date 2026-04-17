import { useUiLocale } from "@/lib/ui-locale";
import { Button, Space } from "antd";

export function LanguageSwitcher() {
  const { locale, setLocale } = useUiLocale();

  return (
    <Space.Compact className="rounded-md border border-border bg-background p-0.5">
      <Button
        type={locale === "en" ? "primary" : "default"}
        size="small"
        className="!h-7 !min-w-[2.25rem] !px-2 !text-xs"
        onClick={() => setLocale("en")}
      >
        EN
      </Button>
      <Button
        type={locale === "es" ? "primary" : "default"}
        size="small"
        className="!h-7 !min-w-[2.25rem] !px-2 !text-xs"
        onClick={() => setLocale("es")}
      >
        ES
      </Button>
    </Space.Compact>
  );
}
