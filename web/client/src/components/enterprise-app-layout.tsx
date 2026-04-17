import { useRef, useState, type ReactNode } from "react";
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
} from "@ant-design/icons";
import { App, Layout, Menu, Button, Space, Typography, Avatar, Divider } from "antd";
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
import { Link } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

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
          logOut: "Log out",
        };

  const navItems = user?.isAdmin
    ? [...NAV_ITEMS, { key: "adminOrders" as const, href: "/admin/orders" }]
    : NAV_ITEMS;

  const menuItems: MenuProps["items"] = [
    ...navItems.map((item) => ({
      key: item.href,
      icon: NAV_ICON[item.key] ?? <FileTextOutlined />,
      label: (
        <span data-testid={`nav-${item.key}`}>{t[item.key as keyof typeof t] ?? item.key}</span>
      ),
    })),
    { type: "divider" as const },
    {
      key: "/tutorial",
      icon: <BookOutlined />,
      label: <span data-testid="nav-tutorial">{t.tutorial}</span>,
    },
  ];

  const normalizedPath = !location || location === "/" ? "/" : location;
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
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Sider
        collapsed={collapsed}
        width={260}
        collapsedWidth={72}
        theme="dark"
        style={{
          background: "hsl(var(--sidebar))",
          borderRight: `1px solid hsl(var(--sidebar-border))`,
          overflow: "hidden",
        }}
        trigger={null}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            minHeight: 0,
          }}
        >
          <div style={{ padding: collapsed ? "12px 8px" : "16px 12px", flexShrink: 0 }}>
            <div
              className="group"
              data-collapsible={collapsed ? "icon" : undefined}
              style={{ maxHeight: collapsed ? 44 : undefined, overflow: "hidden" }}
            >
              <VestaBrandLogoSidebar />
            </div>
          </div>
          <Divider style={{ margin: "8px 0", borderColor: "hsl(var(--sidebar-border))", flexShrink: 0 }} />
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={selectedKeys}
            items={menuItems}
            onClick={onMenuClick}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              background: "transparent",
              borderInlineEnd: "none",
            }}
          />
          <div style={{ flexShrink: 0, padding: collapsed ? "8px 6px 16px" : "12px 12px 20px" }}>
            {!collapsed && (
              <>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 8,
                  }}
                >
                  {t.language}
                </Text>
                <Space.Compact block style={{ marginBottom: 8 }}>
                  <Button
                    type={locale === "en" ? "primary" : "default"}
                    size="small"
                    data-testid="locale-en"
                    onClick={() => setLocale("en")}
                    style={{ width: "50%" }}
                  >
                    EN
                  </Button>
                  <Button
                    type={locale === "es" ? "primary" : "default"}
                    size="small"
                    data-testid="locale-es"
                    onClick={() => setLocale("es")}
                    style={{ width: "50%" }}
                  >
                    ES
                  </Button>
                </Space.Compact>
                <Text type="secondary" style={{ fontSize: 10, display: "block", marginBottom: 12 }}>
                  {locale === "es" ? t.langEs : t.langEn}
                </Text>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 8,
                  }}
                >
                  {t.demoReportsLabel}
                </Text>
                <Space direction="vertical" size={6} style={{ width: "100%", marginBottom: 12 }}>
                  <Button
                    size="small"
                    block
                    loading={demoBusy === "analysis"}
                    disabled={demoBusy === "expert"}
                    data-testid="nav-demo-analysis"
                    onClick={() => void runDemo("analysis_pack")}
                  >
                    {t.demoAnalysis}
                  </Button>
                  <Button
                    size="small"
                    block
                    loading={demoBusy === "expert"}
                    disabled={demoBusy === "analysis"}
                    data-testid="nav-demo-expert"
                    onClick={() => void runDemo("expert_report")}
                  >
                    {t.demoExpert}
                  </Button>
                </Space>
                <Space size={8} wrap style={{ marginBottom: 12 }}>
                  <Link href="/legal/terms">
                    <Button type="link" size="small" style={{ padding: 0, height: "auto" }}>
                      {t.terms}
                    </Button>
                  </Link>
                  <Link href="/legal/privacy">
                    <Button type="link" size="small" style={{ padding: 0, height: "auto" }}>
                      {t.privacy}
                    </Button>
                  </Link>
                </Space>
              </>
            )}
            <Divider style={{ margin: "8px 0", borderColor: "hsl(var(--sidebar-border))" }} />
            <Space
              direction={collapsed ? "vertical" : "horizontal"}
              align="center"
              style={{ width: "100%", justifyContent: collapsed ? "center" : "space-between" }}
              size={collapsed ? 8 : "middle"}
            >
              <Avatar style={{ backgroundColor: "hsl(var(--primary))", flexShrink: 0 }}>{initials}</Avatar>
              {!collapsed && (
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text strong ellipsis style={{ display: "block", color: "hsl(var(--sidebar-foreground))" }}>
                    {user?.username ?? "User"}
                  </Text>
                  <Text type="secondary" ellipsis style={{ fontSize: 11 }}>
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
              <Button size="small" block style={{ marginTop: 8 }} data-testid="logout-button" onClick={logout}>
                {t.logOut}
              </Button>
            )}
          </div>
        </div>
      </Sider>
      <Layout style={{ minHeight: 0, background: "transparent" }}>
        <Header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 48,
            lineHeight: "48px",
            paddingInline: 16,
            borderBottom: `1px solid hsl(var(--border))`,
            backdropFilter: "blur(8px)",
          }}
        >
          <Button
            type="text"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-testid="sidebar-trigger"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((c) => !c)}
          />
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            <ThemeToggle />
          </div>
        </Header>
        <Content style={{ minHeight: 0, overflow: "auto" }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
