import { useEffect } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { UiLocaleProvider } from "@/lib/ui-locale";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import MapPage from "@/pages/map-page";
import MarketTrends from "@/pages/market-trends";
import SavedProperties from "@/pages/saved-properties";
import Reports from "@/pages/reports";
import ReportDetail from "@/pages/report-detail";
import LegalTermsPage from "@/pages/legal-terms";
import LegalPrivacyPage from "@/pages/legal-privacy";
import NotFound from "@/pages/not-found";

// Apply dark mode by default
function applyDefaultTheme() {
  document.documentElement.classList.add("dark");
}

function AppRouter() {
  const { user, isLoading } = useAuth();
  const [location] = useHashLocation();

  const isLegalRoute =
    location === "/legal/terms" || location === "/legal/privacy";

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <svg
            width="40"
            height="40"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="animate-pulse"
          >
            <rect width="32" height="32" rx="8" fill="hsl(38 70% 50%)" />
            <path
              d="M16 8L25 15V25H20V19H12V25H7V15L16 8Z"
              fill="white"
              fillOpacity="0.9"
            />
            <rect x="13.5" y="19" width="5" height="6" rx="1" fill="hsl(38 70% 50%)" />
          </svg>
          <p className="text-sm text-muted-foreground">Loading Vesta AI…</p>
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
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger data-testid="sidebar-trigger" className="-ml-1" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/map" component={MapPage} />
            <Route path="/trends" component={MarketTrends} />
            <Route path="/properties" component={SavedProperties} />
            <Route path="/reports" component={Reports} />
            <Route path="/reports/:id" component={ReportDetail} />
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
    <QueryClientProvider client={queryClient}>
      <UiLocaleProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>
          </TooltipProvider>
        </AuthProvider>
      </UiLocaleProvider>
    </QueryClientProvider>
  );
}

export default App;
