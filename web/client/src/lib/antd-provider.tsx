import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { App, ConfigProvider, theme } from "antd";
import { StyleProvider } from "@ant-design/cssinjs";
import enUS from "antd/locale/en_US";
import esES from "antd/locale/es_ES";
import { useUiLocale } from "@/lib/ui-locale";

/** North star: fintech premium — single accent, Ant mapped to Vesta tokens (`--vesta-*` shell rhythm in index.css). */
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
        colorBgLayout: "hsl(var(--background))",
        colorBgContainer: "hsl(var(--card))",
        colorBgElevated: "hsl(var(--popover))",
        colorBorder: "hsl(var(--border))",
        colorBorderSecondary: "hsl(var(--card-border))",
        colorText: "hsl(var(--foreground))",
        colorTextSecondary: "hsl(var(--muted-foreground))",
        colorTextTertiary: "hsl(var(--muted-foreground) / 0.82)",
        colorSplit: "hsl(var(--border))",
        colorError: "hsl(var(--destructive))",
        colorWarning: "hsl(38 70% 50%)",
        colorSuccess: "hsl(152 55% 42%)",
        controlOutline: "hsl(var(--ring) / 0.35)",
        controlTmpOutline: "hsl(var(--ring) / 0.2)",
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
          darkItemSelectedBg: "hsl(var(--sidebar-accent))",
          darkItemHoverBg: "hsl(var(--sidebar-accent) / 0.65)",
        },
        Card: {
          colorBgContainer: "hsl(var(--card))",
          colorBorderSecondary: "hsl(var(--card-border))",
          headerBg: "transparent",
        },
        Modal: {
          contentBg: "hsl(var(--card))",
          headerBg: "hsl(var(--card))",
          footerBg: "hsl(var(--card))",
          titleColor: "hsl(var(--foreground))",
          titleFontSize: 16,
        },
        Button: {
          primaryShadow: "0 2px 0 hsl(222 40% 8% / 0.12)",
        },
        Input: {
          colorBgContainer: "hsl(var(--background))",
          hoverBg: "hsl(var(--background))",
          activeBorderColor: VESTA_PRIMARY,
          hoverBorderColor: "hsl(var(--border))",
        },
        InputNumber: {
          colorBgContainer: "hsl(var(--background))",
        },
        Select: {
          colorBgContainer: "hsl(var(--background))",
        },
        Table: {
          colorBgContainer: "hsl(var(--card))",
          headerBg: "hsl(var(--muted) / 0.4)",
          headerColor: "hsl(var(--foreground))",
          borderColor: "hsl(var(--border))",
          rowHoverBg: "hsl(var(--muted) / 0.25)",
        },
        Tabs: {
          itemColor: "hsl(var(--muted-foreground))",
          itemSelectedColor: "hsl(var(--foreground))",
          itemHoverColor: "hsl(var(--foreground))",
          inkBarColor: VESTA_PRIMARY,
          titleFontSize: 14,
        },
        Typography: {
          colorText: "hsl(var(--foreground))",
          colorTextSecondary: "hsl(var(--muted-foreground))",
          colorTextHeading: "hsl(var(--foreground))",
        },
        Divider: {
          colorSplit: "hsl(var(--border))",
        },
        Skeleton: {
          colorFill: "hsl(var(--muted))",
          colorFillContent: "hsl(var(--muted) / 0.5)",
        },
        Tag: {
          defaultBg: "hsl(var(--muted))",
          defaultColor: "hsl(var(--foreground))",
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
