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

  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    search_depth: recency === "any" ? "basic" : "advanced",
    max_results: maxResults,
    include_domains: TAVILY_LISTING_DOMAINS,
  };
  if (recency !== "any") {
    body.time_range = recency;
  }

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return JSON.stringify({
        error: "tavily_http",
        status: res.status,
        detail: text.slice(0, 240),
        results: [],
      });
    }
    const data = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string; published_date?: string }[];
    };
    const raw = Array.isArray(data.results) ? data.results : [];
    const results: SpainSearchLinkResult[] = [];
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
      results.push(item);
    }
    return JSON.stringify({
      ok: true,
      queryUsed: query.slice(0, 400),
      assetFocus: profile,
      recency: recency === "any" ? undefined : recency,
      results,
    });
  } catch {
    return JSON.stringify({ error: "tavily_failed", results: [] });
  } finally {
    clearTimeout(to);
  }
}
