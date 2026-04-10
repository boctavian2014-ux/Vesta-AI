/**
 * Web search for property listing links (Tavily). URLs are filtered to allowed Spanish portals.
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

export function isTavilySearchConfigured(): boolean {
  return Boolean((process.env.TAVILY_API_KEY || "").trim());
}

export type SpainSearchLinkResult = {
  title: string;
  url: string;
  snippet: string;
};

export async function searchSpainPropertyLinksJson(params: {
  city: string;
  neighborhood?: string;
  propertyType?: string;
  transaction?: "sale" | "rent" | "either";
  maxResults?: number;
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

  const nb = params.neighborhood?.trim().slice(0, 120);
  const ptype = params.propertyType?.trim().slice(0, 80);
  const parts = ["Spain", city];
  if (nb) parts.push(nb);
  if (ptype) parts.push(ptype);
  if (params.transaction === "rent") parts.push("alquiler");
  else if (params.transaction === "sale") parts.push("venta");
  else parts.push("venta alquiler");
  parts.push("piso casa chalet property listing");

  const query = parts.join(" ");
  const maxResults = Math.min(Math.max(params.maxResults ?? 6, 1), 8);

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: maxResults,
        include_domains: TAVILY_LISTING_DOMAINS,
      }),
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
      results?: { title?: string; url?: string; content?: string }[];
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
      results.push({
        title: (typeof r.title === "string" && r.title.trim() ? r.title : url).slice(0, 300),
        url,
        snippet: (typeof r.content === "string" ? r.content : "").slice(0, 450),
      });
    }
    return JSON.stringify({
      ok: true,
      queryUsed: query.slice(0, 400),
      results,
    });
  } catch {
    return JSON.stringify({ error: "tavily_failed", results: [] });
  } finally {
    clearTimeout(to);
  }
}
