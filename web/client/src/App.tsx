import { useEffect, useState } from "react";
import { Switch, Route, Router, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { UiLocaleProvider } from "@/lib/ui-locale";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { AmbientBackground } from "@/components/ambient-background";

import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import MapPage from "@/pages/map-page";
import MarketTrends from "@/pages/market-trends";
import SavedProperties from "@/pages/saved-properties";
import Reports from "@/pages/reports";
import ReportDetail from "@/pages/report-detail";
import AdminOrders from "@/pages/admin-orders";
import LegalTermsPage from "@/pages/legal-terms";
import LegalPrivacyPage from "@/pages/legal-privacy";
import TutorialPage from "@/pages/tutorial";
import PropertySearchChatPage from "@/pages/property-search-chat";
import NotFound from "@/pages/not-found";
import { VESTA_BRAND_ASSET_QUERY } from "@/components/vesta-brand-logo";

// Apply dark mode by default
function applyDefaultTheme() {
  document.documentElement.classList.add("dark");
}

function AppRouter() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const [authGateTimedOut, setAuthGateTimedOut] = useState(false);

  const isLegalRoute =
    location === "/legal/terms" || location === "/legal/privacy";

  useEffect(() => {
    if (!isLoading) {
      setAuthGateTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setAuthGateTimedOut(true);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [isLoading]);

  if (isLoading && !authGateTimedOut) {
    return (
      <div className="relative z-10 flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-4 px-4">
          <div className="rounded-3xl glass-card px-6 py-4">
            <img
              src={`/vesta-logo.png${VESTA_BRAND_ASSET_QUERY}`}
              alt="Vesta AI"
              width={520}
              height={180}
              className="h-auto w-full max-w-[520px] object-contain animate-pulse"
              decoding="async"
            />
          </div>
          <p className="text-sm text-muted-foreground">Loading Vesta AI...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (isLegalRoute) {
      return (
        <Switch>
          <Route path="/legal/terms" component={LegalTermsPage} />
          <Route path="/legal/privacy" component={LegalPrivacyPage} />
        </Switch>
      );
    }
    return <AuthPage />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-h-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger data-testid="sidebar-trigger" className="-ml-1" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/map" component={MapPage} />
            <Route path="/property-search" component={PropertySearchChatPage} />
            <Route path="/trends" component={MarketTrends} />
            <Route path="/properties" component={SavedProperties} />
            <Route path="/reports/:id" component={ReportDetail} />
            <Route path="/reports" component={Reports} />
            <Route path="/tutorial" component={TutorialPage} />
            {user?.isAdmin && <Route path="/admin/orders" component={AdminOrders} />}
            <Route path="/legal/terms" component={LegalTermsPage} />
            <Route path="/legal/privacy" component={LegalPrivacyPage} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function App() {
  useEffect(() => {
    applyDefaultTheme();
  }, []);

  return (
    <div className="relative min-h-svh">
      <QueryClientProvider client={queryClient}>
        <UiLocaleProvider>
          <AmbientBackground />
          <div className="relative z-10 min-h-svh">
            <AuthProvider>
              <TooltipProvider>
                <Toaster />
                <Router>
                  <AppRouter />
                </Router>
              </TooltipProvider>
            </AuthProvider>
          </div>
        </UiLocaleProvider>
      </QueryClientProvider>
    </div>
  );
}

export default App;
