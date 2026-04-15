/**
 * Optional Content-Security-Policy in **report-only** mode (does not block resources).
 * Enable in production with `VESTA_CSP_REPORT_ONLY=1` and watch browser console / reports for violations,
 * then tighten directives or move to enforce when safe.
 */

export type HelmetCspOption = false | { reportOnly: true; directives: Record<string, string[]> };

export function getHelmetContentSecurityPolicy(): HelmetCspOption {
  if (process.env.NODE_ENV !== "production") return false;
  const enabled = ["1", "true", "yes"].includes((process.env.VESTA_CSP_REPORT_ONLY || "").trim().toLowerCase());
  if (!enabled) return false;

  return {
    reportOnly: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://js.stripe.com", "https://maps.googleapis.com", "https://*.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://api.fontshare.com"],
      fontSrc: [
        "'self'",
        "data:",
        "https://fonts.gstatic.com",
        "https://cdn.fontshare.com",
        "https://*.fontshare.com",
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.mapbox.com",
        "https://*.google.com",
        "https://*.googleapis.com",
        "https://*.gstatic.com",
        "https://*.ggpht.com",
        "https://*.openstreetmap.org",
        "https://tile.openstreetmap.org",
      ],
      connectSrc: [
        "'self'",
        "https://api.stripe.com",
        "https://*.stripe.com",
        "https://*.stripe.network",
        "https://m.stripe.network",
        "https://r.stripe.com",
        "https://api.mapbox.com",
        "https://*.mapbox.com",
        "https://events.mapbox.com",
        "https://maps.googleapis.com",
        "https://*.googleapis.com",
        "https://nominatim.openstreetmap.org",
      ],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com", "https://*.stripe.com"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://checkout.stripe.com", "https://*.stripe.com"],
      manifestSrc: ["'self'"],
      frameAncestors: ["'self'"],
    },
  };
}
