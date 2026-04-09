/** Server-side tools for Spain property search agent (geocoding + allowed listing URLs). */

export type SpainListingCard = {
  title: string;
  sourceUrl: string;
  sourceName?: string;
  lat?: number;
  lon?: number;
};

const ALLOWED_LISTING_SUFFIXES = [
  "idealista.com",
  "fotocasa.es",
  "habitaclia.com",
  "pisos.com",
  "yaencontre.com",
  "milanuncios.com",
];

export function isAllowedListingHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_LISTING_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

function extractMetaContent(html: string, attr: "property" | "name", key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(
    `<meta[^>]+${attr}=["']${esc}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1?.[1]) return decodeHtmlEntities(m1[1].trim());
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${esc}["']`,
    "i",
  );
  const m2 = html.match(re2);
  if (m2?.[1]) return decodeHtmlEntities(m2[1].trim());
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,500})<\/title>/i);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null;
}

export async function geocodePlaceSpain(query: string): Promise<string> {
  const q = query.trim().slice(0, 240);
  if (!q) {
    return JSON.stringify({ error: "empty_query", results: [] });
  }
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q,
    format: "json",
    limit: "5",
    countrycodes: "es",
  }).toString()}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Vesta-AI/1.0 (https://github.com/vesta; spain-property-search)",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return JSON.stringify({ error: "nominatim_http", status: res.status, results: [] });
    }
    const data = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[];
    const results = (Array.isArray(data) ? data : []).map((row) => ({
      lat: row.lat != null ? Number(row.lat) : null,
      lon: row.lon != null ? Number(row.lon) : null,
      displayName: typeof row.display_name === "string" ? row.display_name.slice(0, 500) : null,
    }));
    return JSON.stringify({ results });
  } catch {
    return JSON.stringify({ error: "nominatim_failed", results: [] });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchListingPageMetadata(urlStr: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(urlStr.trim());
  } catch {
    return JSON.stringify({ error: "invalid_url" });
  }
  if (u.protocol !== "https:") {
    return JSON.stringify({ error: "https_only" });
  }
  if (!isAllowedListingHost(u.hostname)) {
    return JSON.stringify({
      error: "host_not_allowed",
      hint: "Allowed: Idealista, Fotocasa, Habitaclia, Pisos, YaEncontre, Milanuncios (Spain).",
    });
  }

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(u.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "Vesta-AI/1.0 (listing preview; contact: support)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    const text = await res.text();
    const slice = text.slice(0, 450_000);
    const title =
      extractMetaContent(slice, "property", "og:title") ||
      extractMetaContent(slice, "name", "twitter:title") ||
      extractTitleTag(slice);
    const description =
      extractMetaContent(slice, "property", "og:description") ||
      extractMetaContent(slice, "name", "description");
    return JSON.stringify({
      ok: res.ok,
      httpStatus: res.status,
      title: title ? title.slice(0, 500) : null,
      description: description ? description.slice(0, 2000) : null,
      url: u.toString(),
    });
  } catch {
    return JSON.stringify({ error: "fetch_failed" });
  } finally {
    clearTimeout(to);
  }
}

export function recordEmittedListings(raw: unknown, acc: SpainListingCard[]): string {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { listings?: unknown }).listings)) {
    return JSON.stringify({ error: "invalid_payload", recorded: 0 });
  }
  const arr = (raw as { listings: unknown[] }).listings;
  let recorded = 0;
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? "").trim().slice(0, 400);
    const sourceUrl = String(o.sourceUrl ?? "").trim().slice(0, 2000);
    if (!title || !sourceUrl) continue;
    let lat: number | undefined;
    let lon: number | undefined;
    if (typeof o.lat === "number" && Number.isFinite(o.lat)) lat = o.lat;
    else if (typeof o.lat === "string" && o.lat.trim()) {
      const n = Number(o.lat);
      if (Number.isFinite(n)) lat = n;
    }
    if (typeof o.lon === "number" && Number.isFinite(o.lon)) lon = o.lon;
    else if (typeof o.lon === "string" && o.lon.trim()) {
      const n = Number(o.lon);
      if (Number.isFinite(n)) lon = n;
    }
    const sourceName =
      typeof o.sourceName === "string" ? o.sourceName.trim().slice(0, 120) : undefined;
    acc.push({
      title,
      sourceUrl,
      ...(sourceName ? { sourceName } : {}),
      ...(lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
        ? { lat, lon }
        : {}),
    });
    recorded += 1;
  }
  return JSON.stringify({ recorded });
}

export function dedupeListings(cards: SpainListingCard[]): SpainListingCard[] {
  const seen = new Set<string>();
  const out: SpainListingCard[] = [];
  for (const c of cards) {
    const key = c.sourceUrl.split("?")[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
