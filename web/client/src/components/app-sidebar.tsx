import { useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import {
  Map,
  LayoutDashboard,
  TrendingUp,
  Bookmark,
  FileText,
  LogOut,
} from "lucide-react";
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

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Map", icon: Map, href: "/map" },
  { label: "Market Trends", icon: TrendingUp, href: "/trends" },
  { label: "Saved Properties", icon: Bookmark, href: "/properties" },
  { label: "Reports", icon: FileText, href: "/reports" },
];

function VestaLogo() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        aria-label="Vesta AI logo"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background */}
        <rect width="32" height="32" rx="8" fill="hsl(38 70% 50%)" />
        {/* Geometric house icon */}
        <path
          d="M16 6L27 14V26H21V20H11V26H5V14L16 6Z"
          fill="white"
          fillOpacity="0.15"
        />
        <path
          d="M16 8L25 15V25H20V19H12V25H7V15L16 8Z"
          fill="white"
          fillOpacity="0.9"
        />
        {/* Door/window accent */}
        <rect x="13.5" y="19" width="5" height="6" rx="1" fill="hsl(38 70% 50%)" />
        {/* Roof peak line */}
        <path d="M16 8L25 15" stroke="white" strokeWidth="1" strokeOpacity="0.5" />
        <path d="M16 8L7 15" stroke="white" strokeWidth="1" strokeOpacity="0.5" />
      </svg>
      <span className="font-semibold text-base tracking-tight text-foreground">
        Vesta AI
      </span>
    </div>
  );
}

export function AppSidebar() {
  const [location, navigate] = useHashLocation();
  const { user, logout } = useAuth();

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "VA";

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="pb-2">
        <VestaLogo />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => navigate(item.href)}
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                      tooltip={item.label}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-4">
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
            size="icon"
            onClick={logout}
            data-testid="logout-button"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
