/** Server-side tools for Spain property search agent (geocoding + allowed listing URLs). */

/** Max cards per assistant turn (matches search_spain_property_links cap). */
export const MAX_EMITTED_LISTING_CARDS = 12;

export type SpainListingCard = {
  title: string;
  sourceUrl: string;
  sourceName?: string;
  lat?: number;
  lon?: number;
  /** Short excerpt from web search or portal metadata */
  snippet?: string;
  neighborhood?: string;
  /** Where the card came from (for UI disclaimer) */
  listingSource?: "web_search" | "portal_url";
  /**
   * With lat/lon: property = exact-building style pin when coords are reliable;
   * area_center = approximate neighborhood center from geocode_place (not a specific listing).
   */
  mapHint?: "property" | "area_center";
  /** Advertiser / agency or "particular" when extractable from public page — not legal owner */
  listedBy?: string;
  /** Publication or update hint from search index or page metadata — confirm on portal */
  publishedAt?: string;
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

type JsonLdPick = { names: string[]; dates: string[] };

function pushAgentName(target: JsonLdPick, x: unknown): void {
  if (typeof x === "string") {
    const s = x.trim();
    if (s.length > 1 && s.length < 200) target.names.push(s);
    return;
  }
  if (!x || typeof x !== "object") return;
  const o = x as { name?: unknown; "@type"?: unknown };
  if (typeof o.name === "string") {
    const s = o.name.trim();
    if (s.length > 1 && s.length < 200) target.names.push(s);
  }
}

function walkJsonLdForListingMeta(node: unknown, acc: JsonLdPick, depth: number): void {
  if (depth > 24 || node == null) return;
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) walkJsonLdForListingMeta(x, acc, depth + 1);
    return;
  }
  const o = node as Record<string, unknown>;
  if (o["@graph"]) {
    walkJsonLdForListingMeta(o["@graph"], acc, depth + 1);
    return;
  }

  const typeRaw = o["@type"];
  const types = Array.isArray(typeRaw)
    ? typeRaw.map((t) => String(t).toLowerCase())
    : typeRaw
      ? [String(typeRaw).toLowerCase()]
      : [];

  const listingLike = types.some(
    (t) =>
      t.includes("realestatelisting") ||
      t.includes("product") ||
      t.includes("apartment") ||
      t.includes("house") ||
      t.includes("residence") ||
      t.includes("singlefamilyresidence"),
  );
  const orgLike = types.some(
    (t) =>
      t.includes("organization") ||
      t.includes("realestateagent") ||
      t.includes("localbusiness") ||
      t.includes("brand"),
  );

  if (listingLike) {
    pushAgentName(acc, o.seller);
    pushAgentName(acc, o.broker);
    pushAgentName(acc, o.provider);
    pushAgentName(acc, o.brand);
    if (o.offers && typeof o.offers === "object") {
      const off = o.offers as Record<string, unknown>;
      pushAgentName(acc, off.seller);
    }
  } else if (orgLike) {
    pushAgentName(acc, o.name);
  }

  for (const key of ["datePublished", "dateModified", "uploadDate"] as const) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) acc.dates.push(v.trim().slice(0, 48));
  }

  for (const [k, v] of Object.entries(o)) {
    if (k === "@context" || k === "@graph") continue;
    walkJsonLdForListingMeta(v, acc, depth + 1);
  }
}

function extractJsonLdScripts(html: string): unknown[] {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out: unknown[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* ignore invalid blocks */
    }
  }
  return out;
}

function extractListingAdvertiserAndDates(html: string): { listedBy: string | null; pagePublishedAt: string | null } {
  const acc: JsonLdPick = { names: [], dates: [] };
  for (const root of extractJsonLdScripts(html)) {
    walkJsonLdForListingMeta(root, acc, 0);
  }

  const metaPub =
    extractMetaContent(html, "property", "article:published_time") ||
    extractMetaContent(html, "name", "article:published_time") ||
    extractMetaContent(html, "property", "article:modified_time");
  const ogUpd = extractMetaContent(html, "property", "og:updated_time");
  if (metaPub?.trim()) acc.dates.push(metaPub.trim().slice(0, 48));
  if (ogUpd?.trim()) acc.dates.push(ogUpd.trim().slice(0, 48));

  const seen = new Set<string>();
  let listedBy: string | null = null;
  for (const n of acc.names) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    listedBy = n.slice(0, 160);
    break;
  }

  let pagePublishedAt: string | null = acc.dates[0] ? acc.dates[0].slice(0, 40) : null;

  return { listedBy, pagePublishedAt };
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
    const { listedBy, pagePublishedAt } = extractListingAdvertiserAndDates(slice);
    return JSON.stringify({
      ok: res.ok,
      httpStatus: res.status,
      title: title ? title.slice(0, 500) : null,
      description: description ? description.slice(0, 2000) : null,
      url: u.toString(),
      listedBy: listedBy || null,
      pagePublishedAt: pagePublishedAt || null,
      note:
        "listedBy is the public advertiser on the listing page (e.g. agency), not necessarily the legal property owner (titular registral).",
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
  const arr = (raw as { listings: unknown[] }).listings.slice(0, MAX_EMITTED_LISTING_CARDS);
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
    const snippet =
      typeof o.snippet === "string" ? o.snippet.trim().slice(0, 500) : undefined;
    const neighborhood =
      typeof o.neighborhood === "string" ? o.neighborhood.trim().slice(0, 120) : undefined;
    const listingSource =
      o.listingSource === "web_search" || o.listingSource === "portal_url"
        ? o.listingSource
        : undefined;
    const mapHint =
      o.mapHint === "area_center" || o.mapHint === "property" ? o.mapHint : undefined;
    const listedBy =
      typeof o.listedBy === "string" ? o.listedBy.trim().slice(0, 200) : undefined;
    const publishedAt =
      typeof o.publishedAt === "string" ? o.publishedAt.trim().slice(0, 48) : undefined;

    const card: SpainListingCard = {
      title,
      sourceUrl,
      ...(sourceName ? { sourceName } : {}),
      ...(snippet ? { snippet } : {}),
      ...(neighborhood ? { neighborhood } : {}),
      ...(listingSource ? { listingSource } : {}),
      ...(listedBy ? { listedBy } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
        ? { lat, lon }
        : {}),
      ...(mapHint && lat != null && lon != null ? { mapHint } : {}),
    };
    acc.push(card);
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
