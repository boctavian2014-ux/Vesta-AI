/**
 * Web search for property listing links (Tavily). URLs are filtered to allowed Spanish portals.
 *
 * Official auction domains (e.g. BOE subastas) are intentionally not included here until
 * fetch_listing_page_metadata is validated on those HTML layouts — see web/README.md.
 */

import { isAllowedListingHost } from "./spainPropertyListingTools";

export const TAVILY_LISTING_DOMAINS = [
  "idealista.com",
  "fotocasa.es",
  "habitaclia.com",
  "pisos.com",
  "yaencontre.com",
  "milanuncios.com",
];

export type SpainSearchProfile =
  | "residential"
  | "commercial"
  | "industrial"
  | "land"
  | "whole_building"
  | "renovation_opportunity"
  | "mixed";

/** Maps to Tavily `time_range`. `any` omits the parameter. */
export type SpainSearchRecency = "any" | "day" | "week" | "month" | "year";

export function isTavilySearchConfigured(): boolean {
  return Boolean((process.env.TAVILY_API_KEY || "").trim());
}

export type SpainSearchLinkResult = {
  title: string;
  url: string;
  snippet: string;
  /** Indexing/publication hint from search engine when provided — confirm on portal */
  publishedAt?: string;
};

type TavilyRawRow = { title?: string; url?: string; content?: string; published_date?: string };

/** Prefer direct listing URLs; Tavily often returns search hub pages. */
function portalUrlKind(urlStr: string): "listing" | "hub" {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return "hub";
  }
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  const p = u.pathname.toLowerCase();

  if (h.endsWith("idealista.com")) {
    return p.includes("/inmueble/") ? "listing" : "hub";
  }
  if (h.endsWith("fotocasa.es")) {
    if (p.includes("/comprar/viviendas/") || p.includes("/alquiler/viviendas/")) return "hub";
    if (p.includes("/comprar/vivienda/") || p.includes("/alquiler/vivienda/")) return "listing";
    if (p.includes("/comprar/piso/") || p.includes("/alquiler/piso/")) return "listing";
    return "hub";
  }
  if (h.endsWith("milanuncios.com")) {
    if (p.includes("/anuncios/") && /\d{7,}/.test(p)) return "listing";
    if (/\/(venta|alquiler)-de-[^/]+.*\.htm$/i.test(p)) return "hub";
    return "listing";
  }
  // Habitaclia, Pisos, YaEncontre: URL shapes vary; only Idealista/Fotocasa/Milanuncios hubs are filtered strictly above.
  return "listing";
}

function normalizeProfile(raw: string | undefined): SpainSearchProfile {
  const p = (raw || "").trim().toLowerCase().replace(/-/g, "_");
  const allowed: SpainSearchProfile[] = [
    "residential",
    "commercial",
    "industrial",
    "land",
    "whole_building",
    "renovation_opportunity",
    "mixed",
  ];
  return (allowed.includes(p as SpainSearchProfile) ? p : "mixed") as SpainSearchProfile;
}

function normalizeRecency(raw: string | undefined): SpainSearchRecency {
  const r = (raw || "").trim().toLowerCase();
  if (r === "day" || r === "week" || r === "month" || r === "year") return r;
  return "any";
}

function querySuffixForProfile(profile: SpainSearchProfile): string {
  switch (profile) {
    case "commercial":
      return "local comercial oficina traspaso anuncio inmobiliaria";
    case "industrial":
      return "nave industrial polígono almacén anuncio inmobiliaria";
    case "land":
      return "terreno solar parcela urbanizable anuncio inmobiliaria";
    case "whole_building":
      return "edificio en venta bloque edificio completo anuncio inmobiliaria";
    case "renovation_opportunity":
      return "para reformar ruina rehabilitar finca edificio anuncio inmobiliaria";
    case "residential":
      return "piso casa chalet estudio vivienda anuncio inmobiliaria";
    case "mixed":
    default:
      return "piso casa local nave terreno edificio propiedad anuncio inmobiliaria";
  }
}

function recencyQueryFragment(recency: SpainSearchRecency): string {
  if (recency === "any") return "";
  if (recency === "day") return "últimos anuncios publicado recientemente hoy";
  if (recency === "week") return "últimos anuncios publicados esta semana";
  if (recency === "month") return "últimos anuncios publicados recientemente";
  return "anuncios inmobiliarios";
}

export async function searchSpainPropertyLinksJson(params: {
  city: string;
  neighborhood?: string;
  propertyType?: string;
  transaction?: "sale" | "rent" | "either";
  maxResults?: number;
  asset_focus?: string;
  recency?: string;
}): Promise<string> {
  const apiKey = (process.env.TAVILY_API_KEY || "").trim();
  if (!apiKey) {
    return JSON.stringify({
      error: "search_not_configured",
      message: "Set TAVILY_API_KEY on the server to search listing links.",
      results: [] as SpainSearchLinkResult[],
    });
  }

  const city = params.city.trim().slice(0, 120);
  if (!city) {
    return JSON.stringify({ error: "city_required", results: [] });
  }

  const profile = normalizeProfile(params.asset_focus);
  const recency = normalizeRecency(params.recency);

  const nb = params.neighborhood?.trim().slice(0, 120);
  const ptype = params.propertyType?.trim().slice(0, 80);
  const parts = ["Spain", city];
  if (nb) parts.push(nb);
  if (ptype) parts.push(ptype);
  if (params.transaction === "rent") parts.push("alquiler");
  else if (params.transaction === "sale") parts.push("venta");
  else parts.push("venta alquiler");

  const rf = recencyQueryFragment(recency).trim();
  if (rf) parts.push(rf);

  parts.push(querySuffixForProfile(profile));

  const query = parts.join(" ");
  const maxResults = Math.min(Math.max(params.maxResults ?? 6, 1), 8);
  // Ask Tavily for extra rows so we can drop hub pages and still return `maxResults` links.
  const tavilyFetchCount = Math.min(15, Math.max(maxResults + 8, 12));

  async function runTavily(bodyIn: Record<string, unknown>): Promise<{
    okHttp: boolean;
    status: number;
    detail: string;
    rawResults: TavilyRawRow[];
  }> {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyIn),
        signal: controller.signal,
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return { okHttp: false, status: res.status, detail: text.slice(0, 240), rawResults: [] };
      }
      let data: { results?: unknown };
      try {
        data = JSON.parse(text) as { results?: unknown };
      } catch {
        return { okHttp: false, status: res.status, detail: "invalid_json", rawResults: [] };
      }
      const raw = Array.isArray(data.results) ? (data.results as TavilyRawRow[]) : [];
      return { okHttp: true, status: res.status, detail: "", rawResults: raw };
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      const isAbort = name === "AbortError";
      return {
        okHttp: false,
        status: 0,
        detail: isAbort ? "timeout_or_abort" : (e instanceof Error ? e.message : "fetch_error").slice(0, 200),
        rawResults: [],
      };
    } finally {
      clearTimeout(to);
    }
  }

  function filterMapAndRank(raw: TavilyRawRow[], cap: number): SpainSearchLinkResult[] {
    const candidates: SpainSearchLinkResult[] = [];
    for (const r of raw) {
      const url = typeof r.url === "string" ? r.url.trim() : "";
      if (!url.startsWith("https://")) continue;
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        continue;
      }
      if (!isAllowedListingHost(host)) continue;
      const pub =
        typeof r.published_date === "string" && r.published_date.trim()
          ? r.published_date.trim().slice(0, 40)
          : undefined;
      const item: SpainSearchLinkResult = {
        title: (typeof r.title === "string" && r.title.trim() ? r.title : url).slice(0, 300),
        url,
        snippet: (typeof r.content === "string" ? r.content : "").slice(0, 450),
      };
      if (pub) item.publishedAt = pub;
      candidates.push(item);
    }
    const listings = candidates.filter((c) => portalUrlKind(c.url) === "listing");
    const hubs = candidates.filter((c) => portalUrlKind(c.url) === "hub");
    const merged = [...listings, ...hubs];
    return merged.slice(0, cap);
  }

  // "basic" is much faster than "advanced"; time_range + query text already bias recency.
  const baseBody: Record<string, unknown> = {
    api_key: apiKey,
    query,
    search_depth: "basic",
    max_results: tavilyFetchCount,
    include_domains: TAVILY_LISTING_DOMAINS,
  };
  if (recency !== "any") {
    baseBody.time_range = recency;
  }

  try {
    let tavily = await runTavily(baseBody);
    if (!tavily.okHttp) {
      return JSON.stringify({
        error: "tavily_http",
        status: tavily.status,
        detail: tavily.detail,
        results: [] as SpainSearchLinkResult[],
      });
    }
    let results = filterMapAndRank(tavily.rawResults, maxResults);
    let recencyRelaxed = false;
    // time_range + strict domains often returns zero hits; one fast retry without time_range
    if (results.length === 0 && recency !== "any") {
      const fallback = { ...baseBody };
      delete fallback.time_range;
      tavily = await runTavily(fallback);
      if (tavily.okHttp) {
        results = filterMapAndRank(tavily.rawResults, maxResults);
        if (results.length > 0) recencyRelaxed = true;
      }
    }

    return JSON.stringify({
      ok: true,
      queryUsed: query.slice(0, 400),
      assetFocus: profile,
      recency: recency === "any" ? undefined : recency,
      ...(recencyRelaxed
        ? {
            note: "time_range filter returned no portal hits; relaxed to any date for this query — dates/snippets are still approximate.",
          }
        : {}),
      results,
    });
  } catch (e) {
    console.error("[spainPropertySearchLinks]", e);
    return JSON.stringify({ error: "tavily_failed", results: [] });
  }
}
