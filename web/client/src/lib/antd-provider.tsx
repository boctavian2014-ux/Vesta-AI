import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { App, ConfigProvider, theme } from "antd";
import { StyleProvider } from "@ant-design/cssinjs";
import enUS from "antd/locale/en_US";
import esES from "antd/locale/es_ES";
import { useUiLocale } from "@/lib/ui-locale";

/** Matches Vesta dark theme `--primary`: hsl(203 78% 52%). */
const VESTA_PRIMARY = "#2ea3eb";

function subscribeDarkClass(onChange: () => void) {
  const el = document.documentElement;
  const obs = new MutationObserver(() => onChange());
  obs.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function getDarkClassSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getDarkClassServer() {
  return true;
}

export function AntDesignRoot({ children }: { children: ReactNode }) {
  const { locale: uiLocale } = useUiLocale();
  const isDark = useSyncExternalStore(subscribeDarkClass, getDarkClassSnapshot, getDarkClassServer);

  const antdLocale = uiLocale === "es" ? esES : enUS;

  const antTheme = useMemo(
    () => ({
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: VESTA_PRIMARY,
        colorInfo: VESTA_PRIMARY,
        borderRadius: 8,
        fontFamily:
          "'General Sans', 'Manrope', 'Inter', 'Helvetica Neue', Arial, sans-serif",
      },
      components: {
        Layout: {
          bodyBg: "transparent",
          headerBg: "hsl(var(--card) / 0.85)",
          headerPadding: "0 16px",
          siderBg: "hsl(var(--sidebar))",
        },
        Menu: {
          darkItemBg: "transparent",
          darkSubMenuItemBg: "transparent",
        },
      },
    }),
    [isDark],
  );

  return (
    <StyleProvider hashPriority="high">
      <ConfigProvider locale={antdLocale} theme={antTheme}>
        <App>{children}</App>
      </ConfigProvider>
    </StyleProvider>
  );
}
