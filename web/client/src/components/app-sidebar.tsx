import { Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import {
  Map,
  LayoutDashboard,
  TrendingUp,
  Bookmark,
  FileText,
  ClipboardList,
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
import { VestaBrandLogoSidebar } from "@/components/vesta-brand-logo";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Map", icon: Map, href: "/map" },
  { label: "Market Trends", icon: TrendingUp, href: "/trends" },
  { label: "Saved Properties", icon: Bookmark, href: "/properties" },
  { label: "Reports", icon: FileText, href: "/reports" },
];

export function AppSidebar() {
  const [location, navigate] = useHashLocation();
  const { user, logout } = useAuth();
  const navItems = user?.isAdmin
    ? [...NAV_ITEMS, { label: "Admin Orders", icon: ClipboardList, href: "/admin/orders" }]
    : NAV_ITEMS;

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "VA";

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
        <div className="px-2 pb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          <Link href="/legal/terms" className="hover:text-foreground hover:underline">
            Termeni
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground hover:underline">
            Confidențialitate
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
