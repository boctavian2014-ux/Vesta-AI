/**
 * Builds the JSON body for POST /financial-analysis on the Python API.
 * - Full explicit { property_data, market_data } passes through unchanged (normalized keys).
 * - Identify-shaped payloads (referenciaCatastral, address, superficie, …) get
 *   property_data / market_data derived from cadastral hints + zone assumptions.
 */

const DEFAULT_SQM = 80;

/** Zone priors (€/m² sale, €/m²/mo rent) — indicative, not quotes. */
const ZONE_PRIORS: Record<string, { avg_sqm_price: number; avg_rent_sqm: number }> = {
  MADRID: { avg_sqm_price: 3800, avg_rent_sqm: 15 },
  BARCELONA: { avg_sqm_price: 4500, avg_rent_sqm: 16 },
  VALENCIA: { avg_sqm_price: 2200, avg_rent_sqm: 11 },
  MALAGA: { avg_sqm_price: 2800, avg_rent_sqm: 12 },
  SEVILLA: { avg_sqm_price: 2100, avg_rent_sqm: 10 },
  BILBAO: { avg_sqm_price: 3200, avg_rent_sqm: 13 },
  PALMA: { avg_sqm_price: 4000, avg_rent_sqm: 14 },
  SPAIN: { avg_sqm_price: 2500, avg_rent_sqm: 12 },
};

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function pickZoneKey(cityRaw: string): keyof typeof ZONE_PRIORS {
  const c = stripDiacritics(cityRaw.toUpperCase());
  for (const key of Object.keys(ZONE_PRIORS)) {
    if (key === "SPAIN") continue;
    const kn = stripDiacritics(key.toUpperCase());
    if (c.includes(kn)) return key as keyof typeof ZONE_PRIORS;
  }
  return "SPAIN";
}

function displayCity(hint: string): string {
  if (!hint || hint.toUpperCase() === "SPAIN") return "Spain";
  return hint.charAt(0) + hint.slice(1).toLowerCase();
}

function resolveCityHint(body: Record<string, unknown>): string {
  const m = String(body.municipio ?? "").trim();
  const p = String(body.provincia ?? "").trim();
  if (m) return m;
  if (p) return p;
  const addr = String(body.address ?? "");
  const mParen = addr.match(/\(([A-Za-zÀ-ÿ\s]+)\)\s*$/);
  if (mParen) {
    const parts = mParen[1].trim().split(/\s+/);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "Spain";
}

function parseSqm(body: Record<string, unknown>): number {
  const sup = num(body.superficie);
  if (sup !== undefined) return sup;
  const raw = body._raw as { data?: { sq_meters?: unknown }; sq_meters?: unknown } | undefined;
  const nested = num(raw?.data?.sq_meters ?? raw?.sq_meters);
  return nested ?? DEFAULT_SQM;
}

function zoneMarket(body: Record<string, unknown>): { avg_sqm_price: number; avg_rent_sqm: number; city: string } {
  const hint = resolveCityHint(body);
  const key = pickZoneKey(hint);
  const prior = ZONE_PRIORS[key];
  const cityLabel = displayCity(hint);
  const out = { ...prior, city: cityLabel };
  const extra = body.market_assumptions;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const e = extra as Record<string, unknown>;
    const ap = num(e.avg_sqm_price);
    const ar = num(e.avg_rent_sqm);
    if (ap !== undefined) out.avg_sqm_price = ap;
    if (ar !== undefined) out.avg_rent_sqm = ar;
    if (typeof e.city === "string" && e.city.trim()) out.city = e.city.trim();
  }
  return out;
}

function normalizePropertyData(o: unknown): Record<string, number> | null {
  if (!o || typeof o !== "object") return null;
  const x = o as Record<string, unknown>;
  const listing = num(x.listing_price ?? x.listingPrice);
  const sqm = num(x.sqm ?? x.sq_meters);
  if (listing === undefined || sqm === undefined) return null;
  return { listing_price: listing, sqm };
}

function normalizeMarketData(o: unknown): Record<string, unknown> | null {
  if (!o || typeof o !== "object") return null;
  const x = o as Record<string, unknown>;
  const avgP = num(x.avg_sqm_price ?? x.avgSqmPrice);
  const avgR = num(x.avg_rent_sqm ?? x.avgRentSqm);
  if (avgP === undefined || avgR === undefined) return null;
  const city = typeof x.city === "string" && x.city.trim() ? x.city.trim() : "Spain";
  return { avg_sqm_price: avgP, avg_rent_sqm: avgR, city };
}

function isCompleteExplicit(body: Record<string, unknown>): boolean {
  return normalizePropertyData(body.property_data) !== null && normalizeMarketData(body.market_data) !== null;
}

export type FinancialAnalysisUpstreamBody = {
  property_data: { listing_price: number; sqm: number };
  market_data: { avg_sqm_price: number; avg_rent_sqm: number; city: string };
  what_if_price?: number;
};

/**
 * Returns the object to JSON.stringify for the Python /financial-analysis endpoint.
 */
export function buildFinancialAnalysisUpstreamBody(
  incoming: Record<string, unknown>
): FinancialAnalysisUpstreamBody {
  if (isCompleteExplicit(incoming)) {
    const pd = normalizePropertyData(incoming.property_data)!;
    const md = normalizeMarketData(incoming.market_data)!;
    const out: FinancialAnalysisUpstreamBody = {
      property_data: pd,
      market_data: {
        avg_sqm_price: md.avg_sqm_price as number,
        avg_rent_sqm: md.avg_rent_sqm as number,
        city: md.city as string,
      },
    };
    const w = num(incoming.what_if_price);
    if (w !== undefined) out.what_if_price = w;
    return out;
  }

  const sqm = parseSqm(incoming);
  const market = zoneMarket(incoming);
  const explicitPrice = num(
    incoming.listing_price ?? incoming.assumed_listing_price ?? incoming.purchase_price
  );
  const partialPd = normalizePropertyData(incoming.property_data);
  const partialMd = normalizeMarketData(incoming.market_data);

  const listing_price =
    partialPd?.listing_price ??
    explicitPrice ??
    Math.round(sqm * market.avg_sqm_price);

  const property_data = {
    sqm: partialPd?.sqm ?? sqm,
    listing_price,
  };

  const market_data = {
    avg_sqm_price: (partialMd?.avg_sqm_price as number) ?? market.avg_sqm_price,
    avg_rent_sqm: (partialMd?.avg_rent_sqm as number) ?? market.avg_rent_sqm,
    city: (partialMd?.city as string) ?? market.city,
  };

  const out: FinancialAnalysisUpstreamBody = { property_data, market_data };
  const w = num(incoming.what_if_price);
  if (w !== undefined) out.what_if_price = w;
  return out;
}
