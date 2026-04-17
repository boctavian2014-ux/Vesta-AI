import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  DashboardOutlined,
  EnvironmentOutlined,
  SearchOutlined,
  LineChartOutlined,
  HeartOutlined,
  FileTextOutlined,
  ShoppingOutlined,
  BookOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { App, Layout, Menu, Button, Space, Typography, Avatar, Divider, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { useAuth } from "@/hooks/use-auth";
import { VestaBrandLogoSidebar } from "@/components/vesta-brand-logo";
import { useUiLocale } from "@/lib/ui-locale";
import {
  createCompletedDemoReport,
  DEMO_MAP_COORDS_MADRID,
  defaultDemoPropertyInfo,
} from "@/lib/create-demo-report";
import { showVestaMessage } from "@/lib/vesta-message";
import { prefetchAppRoute } from "@/lib/route-prefetch";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";

const { Sider, Header, Content } = Layout;
const { Text, Title } = Typography;

const NAV_ITEMS = [
  { key: "dashboard", href: "/" },
  { key: "map", href: "/map" },
  { key: "propertySearch", href: "/property-search" },
  { key: "marketTrends", href: "/trends" },
  { key: "savedProperties", href: "/properties" },
  { key: "reports", href: "/reports" },
] as const;

const NAV_ICON: Record<string, ReactNode> = {
  dashboard: <DashboardOutlined />,
  map: <EnvironmentOutlined />,
  propertySearch: <SearchOutlined />,
  marketTrends: <LineChartOutlined />,
  savedProperties: <HeartOutlined />,
  reports: <FileTextOutlined />,
  adminOrders: <ShoppingOutlined />,
};

export function EnterpriseAppLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [demoBusy, setDemoBusy] = useState<null | "analysis" | "expert">(null);
  const demoRunLockRef = useRef(false);
  const { locale, setLocale } = useUiLocale();
  const t =
    locale === "es"
      ? {
          dashboard: "Panel",
          map: "Mapa",
          propertySearch: "Búsqueda de propiedades",
          marketTrends: "Tendencias del mercado",
          savedProperties: "Propiedades guardadas",
          reports: "Informes",
          adminOrders: "Pedidos (admin)",
          terms: "Términos",
          privacy: "Privacidad",
          tutorial: "Tutorial y servicios",
          language: "Idioma",
          langEn: "Inglés",
          langEs: "Español",
          demoAnalysis: "Modelo ordinario — paquete de análisis (15 €)",
          demoExpert: "Modelo ampliado — expediente experto (50 €)",
          demoError: "No se pudo generar el modelo",
          demoReady: "Modelo generado",
          demoReadyDesc:
            "Consulta demostrativa registrada. Acceda a Informes para revisar el contenido.",
          demoReportsLabel: "Consultas demostrativas",
          demoReportsCollapsedTitle: "Demostración",
          demoReportsHint:
            "Genere un informe de muestra sin cargo; se abre en Informes para revisar el formato.",
          demoAnalysisTitle: "Paquete de análisis",
          demoAnalysisMeta: "Modelo · 15 €",
          demoExpertTitle: "Expediente experto",
          demoExpertMeta: "Modelo · 50 €",
          logOut: "Cerrar sesión",
        }
      : {
          dashboard: "Dashboard",
          map: "Map",
          propertySearch: "Property search",
          marketTrends: "Market trends",
          savedProperties: "Saved properties",
          reports: "Reports",
          adminOrders: "Admin orders",
          terms: "Terms",
          privacy: "Privacy",
          tutorial: "Tutorial & services",
          language: "Language",
          langEn: "English",
          langEs: "Spanish",
          demoAnalysis: "Standard template — analysis package (15 €)",
          demoExpert: "Extended template — expert file (50 €)",
          demoError: "Could not generate demonstration file",
          demoReady: "Demonstration file ready",
          demoReadyDesc:
            "A demonstration entry has been filed. Open Reports to review the contents.",
          demoReportsLabel: "Demonstration requests",
          demoReportsCollapsedTitle: "Demos",
          demoReportsHint:
            "Generate a no-fee sample report; opens in Reports so you can review the layout.",
          demoAnalysisTitle: "Analysis package",
          demoAnalysisMeta: "Template · €15",
          demoExpertTitle: "Expert file",
          demoExpertMeta: "Template · €50",
          logOut: "Log out",
        };

  const navItems = user?.isAdmin
    ? [...NAV_ITEMS, { key: "adminOrders" as const, href: "/admin/orders" }]
    : NAV_ITEMS;

  const menuItems: MenuProps["items"] = [
    ...navItems.map((item) => {
      const labelText = t[item.key as keyof typeof t] ?? item.key;
      return {
        key: item.href,
        icon: NAV_ICON[item.key] ?? <FileTextOutlined />,
        title: labelText,
        label: (
          <span
            data-testid={`nav-${item.key}`}
            onMouseEnter={() => prefetchAppRoute(item.href)}
            onFocus={() => prefetchAppRoute(item.href)}
          >
            {labelText}
          </span>
        ),
      };
    }),
    { type: "divider" as const },
    {
      key: "/tutorial",
      icon: <BookOutlined />,
      title: t.tutorial,
      label: (
        <span
          data-testid="nav-tutorial"
          onMouseEnter={() => prefetchAppRoute("/tutorial")}
          onFocus={() => prefetchAppRoute("/tutorial")}
        >
          {t.tutorial}
        </span>
      ),
    },
  ];

  const normalizedPath = !location || location === "/" ? "/" : location.split("?")[0] || "/";

  const pageCrumb = useMemo(() => {
    const path = normalizedPath;
    const reportMatch = path.match(/^\/reports\/(\d+)$/);
    if (reportMatch) {
      return locale === "es" ? `${t.reports} · #${reportMatch[1]}` : `${t.reports} · #${reportMatch[1]}`;
    }
    const map: Record<string, string> = {
      "/": t.dashboard,
      "/map": t.map,
      "/property-search": t.propertySearch,
      "/trends": t.marketTrends,
      "/properties": t.savedProperties,
      "/reports": t.reports,
      "/tutorial": t.tutorial,
      "/admin/orders": t.adminOrders,
      "/legal/terms": t.terms,
      "/legal/privacy": t.privacy,
    };
    return map[path] ?? null;
  }, [normalizedPath, locale, t]);

  const selectablePaths = new Set<string>([
    ...navItems.map((i) => i.href),
    "/tutorial",
  ]);
  const selectedKeys = selectablePaths.has(normalizedPath) ? [normalizedPath] : [];

  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    navigate(String(key));
  };

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : "VA";

  const runDemo = async (tier: "analysis_pack" | "expert_report") => {
    if (demoRunLockRef.current) return;
    demoRunLockRef.current = true;
    const key = tier === "analysis_pack" ? "analysis" : "expert";
    setDemoBusy(key);
    try {
      const propertyInfo = defaultDemoPropertyInfo(locale);
      const report = await createCompletedDemoReport(tier, {
        locale,
        coords: DEMO_MAP_COORDS_MADRID,
        propertyInfo,
      });
      await qc.invalidateQueries({ queryKey: ["/api/reports"] });
      await qc.invalidateQueries({ queryKey: ["/api/reports", report.id] });
      showVestaMessage(message, {
        title: t.demoReady,
        description: t.demoReadyDesc,
        variant: "success",
        duration: 5000,
      });
      navigate(`/reports/${report.id}`);
    } catch (e: unknown) {
      const errorText = e instanceof Error ? e.message : String(e);
      showVestaMessage(message, { title: t.demoError, description: errorText, variant: "destructive" });
    } finally {
      demoRunLockRef.current = false;
      setDemoBusy(null);
    }
  };

  return (
    <Layout className="min-h-screen bg-transparent">
      <Sider
        collapsed={collapsed}
        width={260}
        collapsedWidth={72}
        theme="dark"
        className="border-r border-sidebar-border !bg-sidebar"
        trigger={null}
      >
        <div className="flex min-h-0 h-dvh flex-col">
          <div className={`shrink-0 ${collapsed ? "px-2 py-3" : "px-3 py-4"}`}>
            <div
              className={`group overflow-hidden ${collapsed ? "max-h-11" : ""}`}
              data-collapsible={collapsed ? "icon" : undefined}
            >
              <VestaBrandLogoSidebar />
            </div>
          </div>
          <Divider className="!my-2 shrink-0 border-sidebar-border" />
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={selectedKeys}
            items={menuItems}
            onClick={onMenuClick}
            className="min-h-0 flex-1 border-e-0 bg-transparent overflow-y-auto"
          />
          {collapsed && (
            <div className="flex shrink-0 flex-col items-center gap-1.5 border-b border-sidebar-border/60 px-1.5 py-2">
              <Tooltip title={t.demoReportsLabel}>
                <Text
                  type="secondary"
                  className="cursor-default text-center text-[9px] font-semibold uppercase leading-none tracking-wide text-sidebar-foreground/55"
                >
                  {t.demoReportsCollapsedTitle}
                </Text>
              </Tooltip>
              <Tooltip title={t.demoAnalysis}>
                <Button
                  type="primary"
                  size="small"
                  className="!flex !h-9 !w-9 !items-center !justify-center !p-0"
                  loading={demoBusy === "analysis"}
                  disabled={demoBusy === "expert"}
                  data-testid="nav-demo-analysis-collapsed"
                  icon={<FileTextOutlined />}
                  aria-label={t.demoAnalysis}
                  onClick={() => void runDemo("analysis_pack")}
                />
              </Tooltip>
              <Tooltip title={t.demoExpert}>
                <Button
                  size="small"
                  className="!flex !h-9 !w-9 !items-center !justify-center !border-sidebar-border/80 !bg-sidebar-accent/50 !p-0 !text-sidebar-foreground hover:!bg-sidebar-accent"
                  loading={demoBusy === "expert"}
                  disabled={demoBusy === "analysis"}
                  data-testid="nav-demo-expert-collapsed"
                  icon={<BookOutlined />}
                  aria-label={t.demoExpert}
                  onClick={() => void runDemo("expert_report")}
                />
              </Tooltip>
            </div>
          )}
          <div className={`shrink-0 space-y-0 ${collapsed ? "px-1.5 pb-4 pt-1" : "px-3 pb-5 pt-2"}`}>
            {!collapsed && (
              <div className="mb-3 space-y-3">
                <div>
                  <Text type="secondary" className="mb-2 block text-[10px] font-medium uppercase tracking-wide">
                    {t.language}
                  </Text>
                  <Space.Compact block className="mb-2">
                    <Button
                      type={locale === "en" ? "primary" : "default"}
                      size="small"
                      data-testid="locale-en"
                      onClick={() => setLocale("en")}
                      className="!w-1/2"
                    >
                      EN
                    </Button>
                    <Button
                      type={locale === "es" ? "primary" : "default"}
                      size="small"
                      data-testid="locale-es"
                      onClick={() => setLocale("es")}
                      className="!w-1/2"
                    >
                      ES
                    </Button>
                  </Space.Compact>
                  <Text type="secondary" className="block text-[10px] leading-tight">
                    {locale === "es" ? t.langEs : t.langEn}
                  </Text>
                </div>
                <Divider className="!my-0 border-sidebar-border/80" />
                <div className="rounded-[var(--vesta-radius-page)] border border-sidebar-border/70 bg-sidebar-accent/30 px-3 py-3 shadow-sm">
                  <Text className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/85">
                    {t.demoReportsLabel}
                  </Text>
                  <Text type="secondary" className="mb-3 block text-[10px] leading-snug text-sidebar-foreground/55">
                    {t.demoReportsHint}
                  </Text>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="small"
                      type="primary"
                      block
                      loading={demoBusy === "analysis"}
                      disabled={demoBusy === "expert"}
                      data-testid="nav-demo-analysis"
                      className="!h-auto !py-2 !leading-tight"
                      onClick={() => void runDemo("analysis_pack")}
                    >
                      <span className="flex w-full flex-col items-stretch gap-0.5 text-left">
                        <span className="text-xs font-semibold">{t.demoAnalysisTitle}</span>
                        <span className="text-[10px] font-normal opacity-90">{t.demoAnalysisMeta}</span>
                      </span>
                    </Button>
                    <Button
                      size="small"
                      block
                      loading={demoBusy === "expert"}
                      disabled={demoBusy === "analysis"}
                      data-testid="nav-demo-expert"
                      className="!h-auto !border-sidebar-border/80 !bg-sidebar-accent/50 !py-2 !text-sidebar-foreground !leading-tight hover:!bg-sidebar-accent"
                      onClick={() => void runDemo("expert_report")}
                    >
                      <span className="flex w-full flex-col items-stretch gap-0.5 text-left">
                        <span className="text-xs font-semibold">{t.demoExpertTitle}</span>
                        <span className="text-[10px] font-normal opacity-80">{t.demoExpertMeta}</span>
                      </span>
                    </Button>
                  </div>
                </div>
                <Space size={8} wrap className="gap-y-1">
                  <Link href="/legal/terms">
                    <Button type="link" size="small" className="!h-auto !p-0 !text-xs">
                      {t.terms}
                    </Button>
                  </Link>
                  <Link href="/legal/privacy">
                    <Button type="link" size="small" className="!h-auto !p-0 !text-xs">
                      {t.privacy}
                    </Button>
                  </Link>
                </Space>
              </div>
            )}
            <Divider className="!my-2 border-sidebar-border" />
            <Space
              direction={collapsed ? "vertical" : "horizontal"}
              align="center"
              className={`w-full ${collapsed ? "justify-center" : "justify-between"}`}
              size={collapsed ? 8 : "middle"}
            >
              <Avatar className="!bg-primary shrink-0 !text-primary-foreground">{initials}</Avatar>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <Text strong ellipsis className="!block text-sidebar-foreground">
                    {user?.username ?? "User"}
                  </Text>
                  <Text type="secondary" ellipsis className="!block text-[11px]">
                    {user?.email ?? ""}
                  </Text>
                </div>
              )}
              {!collapsed && (
                <Button size="small" data-testid="logout-button" onClick={logout}>
                  {t.logOut}
                </Button>
              )}
            </Space>
            {collapsed && (
              <Tooltip title={t.logOut}>
                <Button
                  size="small"
                  block
                  className="mt-2"
                  data-testid="logout-button"
                  icon={<LogoutOutlined />}
                  aria-label={t.logOut}
                  onClick={logout}
                />
              </Tooltip>
            )}
          </div>
        </div>
      </Sider>
      <Layout className="min-h-0 bg-transparent">
        <Header
          className="flex items-center gap-2 border-b border-border bg-card/85 px-4 backdrop-blur-md"
          style={{ height: "var(--vesta-header-h)", lineHeight: "var(--vesta-header-h)" }}
        >
          <Tooltip title={collapsed ? (locale === "es" ? "Expandir menú" : "Expand menu") : locale === "es" ? "Contraer menú" : "Collapse menu"}>
            <Button
              type="text"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              data-testid="sidebar-trigger"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((c) => !c)}
            />
          </Tooltip>
          {pageCrumb ? (
            <Title level={5} className="!mb-0 !ml-1 !text-sm !font-semibold !text-foreground/90 truncate max-w-[min(420px,50vw)]">
              {pageCrumb}
            </Title>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </Header>
        <Content className="min-h-0 overflow-auto">{children}</Content>
      </Layout>
    </Layout>
  );
}
