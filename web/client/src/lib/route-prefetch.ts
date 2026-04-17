/** Warm Vite chunks for lazy routes (no-op if chunk already loaded). */
export function prefetchAppRoute(href: string): void {
  const path = href.split("?")[0] ?? href;
  if (path === "/map" || path.startsWith("/map/")) {
    void import("@/pages/map-page");
    return;
  }
  if (path === "/property-search" || path.startsWith("/property-search")) {
    void import("@/pages/property-search-chat");
    return;
  }
  if (path === "/admin/orders" || path.startsWith("/admin/orders")) {
    void import("@/pages/admin-orders");
    return;
  }
  if (path.startsWith("/reports/") && path !== "/reports") {
    void import("@/pages/report-detail");
  }
}
