import { useRef, useState } from "react";
import { Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { VestaBrandLogoSidebar } from "@/components/vesta-brand-logo";
import { detectBrowserLocale } from "@/lib/locale";
import {
  createCompletedDemoReport,
  DEMO_MAP_COORDS_MADRID,
  defaultDemoPropertyInfo,
} from "@/lib/create-demo-report";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { key: "dashboard", href: "/" },
  { key: "map", href: "/map" },
  { key: "marketTrends", href: "/trends" },
  { key: "savedProperties", href: "/properties" },
  { key: "reports", href: "/reports" },
];

/** Plain buttons: avoids SidebarMenuButton `disabled:opacity-50` on both rows when any demo runs. */
function DemoSidebarAction({
  label,
  busySelf,
  busyOther,
  onRun,
  testId,
}: {
  label: string;
  busySelf: boolean;
  busyOther: boolean;
  onRun: () => void;
  testId: string;
}) {
  const blocked = busySelf || busyOther;
  return (
    <button
      type="button"
      data-testid={testId}
      title={label}
      aria-busy={busySelf}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (blocked) return;
        onRun();
      }}
      className={cn(
        "flex h-8 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border border-white/15 bg-white/10 px-2 text-left text-sm text-foreground backdrop-blur-md transition-colors",
        "hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        blocked && "cursor-default",
        !blocked && "active:bg-white/20",
        busyOther && "pointer-events-none",
        busySelf && "pointer-events-none bg-white/15",
      )}
    >
      {busySelf ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

export function AppSidebar() {
  const [location, navigate] = useHashLocation();
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [demoBusy, setDemoBusy] = useState<null | "analysis" | "expert">(null);
  const demoRunLockRef = useRef(false);
  const locale = detectBrowserLocale();
  const t = locale === "es"
      ? {
          dashboard: "Panel",
          map: "Mapa",
          marketTrends: "Tendencias del mercado",
          savedProperties: "Propiedades guardadas",
          reports: "Informes",
          adminOrders: "Pedidos admin",
          terms: "Términos",
          privacy: "Privacidad",
          tutorial: "Tutorial / Servicios",
          demoAnalysis: "Demo · Análisis 15 €",
          demoExpert: "Demo · Experto 50 €",
          demoError: "No se pudo crear el demo",
          logOut: "Cerrar sesión",
        }
      : {
          dashboard: "Dashboard",
          map: "Map",
          marketTrends: "Market Trends",
          savedProperties: "Saved Properties",
          reports: "Reports",
          adminOrders: "Admin Orders",
          terms: "Terms",
          privacy: "Privacy",
          tutorial: "Tutorial / Services",
          demoAnalysis: "Demo · Financial 15 €",
          demoExpert: "Demo · Expert 50 €",
          demoError: "Could not create demo report",
          logOut: "Log out",
        };
  const navItems = user?.isAdmin
    ? [...NAV_ITEMS, { key: "adminOrders", href: "/admin/orders" }]
    : NAV_ITEMS;

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "VA";

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
        financialData: {},
      });
      await qc.invalidateQueries({ queryKey: ["/api/reports"] });
      navigate(`/reports/${report.id}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast({ title: t.demoError, description: message, variant: "destructive" });
    } finally {
      demoRunLockRef.current = false;
      setDemoBusy(null);
    }
  };

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="pb-2">
        <VestaBrandLogoSidebar />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.href;
                const label = t[item.key as keyof typeof t] ?? item.key;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => navigate(item.href)}
                      data-testid={`nav-${item.key}`}
                      tooltip={label}
                      className="min-w-0 border border-white/15 bg-white/10 backdrop-blur-md text-foreground hover:bg-white/15 data-[active=true]:bg-white/20 data-[active=true]:border-white/30"
                    >
                      <span className="min-w-0 truncate">{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-1" />

        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-1">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location === "/tutorial"}
                  onClick={() => navigate("/tutorial")}
                  data-testid="nav-tutorial"
                  tooltip={t.tutorial}
                  className="min-w-0 border border-white/15 bg-white/10 backdrop-blur-md text-foreground hover:bg-white/15 data-[active=true]:bg-white/20 data-[active=true]:border-white/30"
                >
                  <span className="min-w-0 truncate">{t.tutorial}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="flex flex-col gap-1">
              <DemoSidebarAction
                testId="nav-demo-analysis"
                label={t.demoAnalysis}
                busySelf={demoBusy === "analysis"}
                busyOther={demoBusy === "expert"}
                onRun={() => void runDemo("analysis_pack")}
              />
              <DemoSidebarAction
                testId="nav-demo-expert"
                label={t.demoExpert}
                busySelf={demoBusy === "expert"}
                busyOther={demoBusy === "analysis"}
                onRun={() => void runDemo("expert_report")}
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-6 pt-1">
        <div className="mx-2 mb-1 rounded-lg border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-md flex items-center justify-between text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          <Link href="/legal/terms" className="rounded px-2 py-0.5 hover:text-foreground hover:bg-white/10 hover:underline">
            {t.terms}
          </Link>
          <Link href="/legal/privacy" className="rounded px-2 py-0.5 hover:text-foreground hover:bg-white/10 hover:underline">
            {t.privacy}
          </Link>
        </div>
        <SidebarSeparator className="mb-3" />
        <div className="flex items-center gap-2 px-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium truncate text-foreground">
              {user?.username ?? "User"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email ?? ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            data-testid="logout-button"
            className="h-8 shrink-0 border border-white/15 bg-white/10 px-2 text-xs text-muted-foreground backdrop-blur-md hover:bg-white/15 hover:text-foreground group-data-[collapsible=icon]:hidden"
          >
            {t.logOut}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
