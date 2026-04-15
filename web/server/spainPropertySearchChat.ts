import type { Request, Response } from "express";
import OpenAI from "openai";
import {
  dedupeListings,
  fetchListingPageMetadata,
  geocodePlaceSpain,
  recordEmittedListings,
  type SpainListingCard,
} from "./spainPropertyListingTools";
import { isTavilySearchConfigured, searchSpainPropertyLinksJson } from "./spainPropertySearchLinks";

const MAX_MESSAGES = 24;
const MAX_CONTENT_LENGTH = 8000;
const MAX_AGENT_STEPS = 4;

const SYSTEM_PROMPT_EN = `You are Vesta AI, a concise assistant for people searching for property in Spain: homes, commercial, industrial, land, whole buildings, renovation opportunities (purchase focus unless the user asks about rent).

You have tools:
- search_spain_property_links: find **direct listing (ad) URLs** on major Spanish portals via Tavily — not agency homepages or portal search hubs; each url field should open that specific ad on the portal. Requires at least a city; pass neighborhood (barrio) when the user names one. If the tool JSON includes noteListingPagesOnly or noteCombinedSearch, explain briefly in plain language (wider search / stricter listing-only URLs). Set asset_focus to match intent: residential (default homes), commercial (locales, offices, traspaso), industrial (naves), land (terrenos), whole_building (edificio en bloque), renovation_opportunity (para reformar, ruina, rehabilitar), mixed (broad). Set recency to week or month when the user wants latest/new listings (últimos anuncios, newest, "this week"); use day only if they explicitly ask for very recent/today; use any when they do not care. Returns title, url, snippet, and sometimes publishedAt (search index date — approximate). Use ONLY returned URLs in emit_listings (never invent URLs). When emitting cards from search, copy publishedAt into the card when the tool returned it.
- geocode_place: resolve Spanish addresses or place names to coordinates (OpenStreetMap).
- fetch_listing_page_metadata: read public HTML metadata from a listing URL (allowed portals only). Returns title, description, listedBy (public advertiser — often an agency, not the legal owner), pagePublishedAt when found, and a note distinguishing advertiser vs. titular registral. After this tool, emit_listings must include listedBy and publishedAt (from pagePublishedAt) when those fields are non-null. Tell the user clearly that listedBy is who published the ad, not necessarily the property owner in the land registry.
- emit_listings: register structured cards. For search results: listingSource "web_search", snippet, sourceUrl exact, optional publishedAt from search. For pasted URLs after fetch_listing_page_metadata: listingSource "portal_url", include listedBy and publishedAt when provided.

Internet listings disclaimer:
- Whenever you show cards from search_spain_property_links, your final message must say these are a sample from online search (not every listing in Spain, not Vesta's database), that dates may reflect search indexing not the portal's "updated today", and that price/availability must be verified on the portal.

Map / cadastre identification rules (critical):
- Vesta's map identifies a specific building for analysis only when there is enough location data. Put lat/lon on a card ONLY when you obtained them from geocode_place for a specific Spanish street address or unambiguous place (not vague "area X" guesses).
- Never invent or guess coordinates. If geocoding fails or the query is too vague, emit the card WITHOUT lat/lon.
- Emphasize listings that qualify for "Open on map" in your wording; for others, steer the user to the portal link or ask for a fuller address next time.
- In your final message, state clearly: without sufficient location data, Vesta cannot place an exact pin for cadastre-style identification; if there is no "Open on map" button, they should use the portal or provide a more complete address.

Neighborhood on map (off by default — speed trade-off):
- When the user names barrio + city, always pass both to search_spain_property_links.
- Do NOT add the extra "Approximate area" / area_center map card unless the user explicitly asks to see the neighborhood on the map, approximate area, or similar. Default path: faster replies, fewer tool calls, no geocode for barrio-only context.

Speed (critical):
- The server allows only a few agent steps: minimize tool calls. Typical flow for "show listings in X": search_spain_property_links once, then emit_listings once, then reply — no extra rounds.
- Do NOT call fetch_listing_page_metadata for URLs from search_spain_property_links — only for user-pasted listing links. Emit cards directly from search output (title, url, snippet, publishedAt).
- Trade-off: skipping optional geocode cards and extra tools = faster responses and lower latency; users still get listing links and portal buttons.

Other rules:
- When the user asks to see properties or listings in an area, call search_spain_property_links first (if the tool returns search_not_configured, explain they need TAVILY_API_KEY on the server).
- For general strategy (budgets, neighborhoods, types), answer normally without claiming verified live availability.
- When the user provides a listing URL, call fetch_listing_page_metadata, then emit_listings with listingSource "portal_url". Use geocode_place only when the title/description contains a clear enough address or place in Spain to geocode; otherwise omit lat/lon.
- Never invent portal listing URLs (only use search tool output or user-pasted URLs). Prices from metadata may be stale — say the user should confirm on the portal.
- If asked outside Spain or unrelated topics, politely redirect to Spain property search.
- After using tools, give a short helpful final message to the user (plain text).`;

const SYSTEM_PROMPT_ES = `Eres Vesta AI, asistente breve para búsqueda de inmuebles en España: vivienda, local/comercial, industrial, suelo, edificios enteros, oportunidades de reforma (compra; si piden alquiler, adapta).

Herramientas:
- search_spain_property_links: URLs **directas del anuncio** en portales (no home de agencias ni listados genéricos); cada url debe abrir ese anuncio concreto. Ciudad obligatoria; barrio si lo dice. Si el JSON trae noteListingPagesOnly o noteCombinedSearch, explícalo al usuario en lenguaje claro. Usa asset_focus: residential (vivienda por defecto), commercial (local, oficina, traspaso), industrial (naves), land (terrenos), whole_building (edificio en bloque), renovation_opportunity (para reformar, ruina, rehabilitar), mixed (amplio). Usa recency week o month si pide últimos anuncios / lo más reciente; day solo si pide explícitamente muy reciente/hoy; any si no importa la fecha. Devuelve title, url, snippet y a veces publishedAt (fecha del índice de búsqueda, orientativa). Usa SOLO esas URLs en emit_listings. Si hay publishedAt en el resultado, pásalo a la tarjeta.
- geocode_place: coordenadas en España (OpenStreetMap).
- fetch_listing_page_metadata: título, descripción, listedBy (anunciante público en la web — muchas veces agencia, no el titular registral), pagePublishedAt si existe, y nota aclaratoria. Tras esta herramienta, emite tarjetas con listedBy y publishedAt (desde pagePublishedAt) cuando vengan informados. Explica al usuario que listedBy es quien publica el anuncio, no necesariamente el propietario inscrito en el Registro.
- emit_listings: tarjetas. Búsqueda web: listingSource "web_search" + snippet + publishedAt si aplica. URL pegada tras metadata: listingSource "portal_url" + listedBy/publishedAt del fetch.

Aviso anuncios de internet:
- Si muestras tarjetas de search_spain_property_links, el mensaje final debe decir que es una muestra de búsqueda online (no todos los anuncios de España, no base de datos Vesta), que las fechas pueden reflejar indexación y no el «actualizado hoy» del portal, y que precio/disponibilidad se confirman en el portal.

Reglas mapa / catastro (crítico):
- El mapa de Vesta solo puede identificar un inmueble concreto para análisis si hay datos de ubicación suficientes. Incluye lat/lon en la tarjeta SOLO si las obtuviste con geocode_place para una dirección específica en España o un lugar inequívoco (no adivines por títulos vagos tipo "zona X").
- Nunca inventes coordenadas. Si el geocodificado falla o la consulta es demasiado vaga, emite la tarjeta SIN lat/lon.
- Enfatiza los anuncios que sí califican para "Abrir en mapa"; en los demás, dirige al usuario al enlace del portal o pide una dirección más completa.
- En el mensaje final, deja claro: sin localización suficiente, Vesta no puede colocar un pin exacto para identificación tipo catastro; si no hay botón "Abrir en mapa", debe usar el portal o dar una dirección más completa.

Barrio en mapa (desactivado por defecto — equilibrio velocidad):
- Si dice barrio + ciudad, pasa ambos a search_spain_property_links.
- NO añadas la tarjeta extra «Zona aproximada» / area_center salvo que el usuario pida explícitamente ver el barrio en el mapa, zona aproximada, etc. Por defecto: respuestas más rápidas, menos herramientas, sin geocode solo por barrio.

Velocidad (crítico):
- El servidor permite pocos pasos de agente: minimiza llamadas a herramientas. Flujo típico «muéstrame anuncios en X»: una vez search_spain_property_links, una vez emit_listings, luego mensaje — sin rondas extra.
- NO llames fetch_listing_page_metadata para URLs de search_spain_property_links — solo para enlaces pegados por el usuario. Emite tarjetas directamente con la salida del buscador (title, url, snippet, publishedAt).
- Equilibrio: sin tarjetas opcionales de geocode ni herramientas extra = menos latencia; el usuario sigue teniendo enlaces y «Ver anuncio».

Otras reglas:
- Cuando pida ver propiedades/anuncios en una zona, usa search_spain_property_links primero; si devuelve search_not_configured, explica que falta TAVILY_API_KEY en el servidor.
- En temas generales (presupuesto, barrios, tipos), responde sin afirmar disponibilidad verificada en tiempo real.
- Si hay URL de anuncio pegada, llama fetch_listing_page_metadata y luego emit_listings con listingSource "portal_url". Usa geocode_place solo si el título/descripción contiene una dirección o lugar en España lo bastante claro; si no, omite lat/lon.
- No inventes URLs de anuncios en portales (solo salida del buscador o URL pegada por el usuario). Los precios pueden estar desactualizados — indica que confirme en el portal.
- Fuera de España u otros temas: redirige con cortesía.
- Tras herramientas, mensaje final breve al usuario.`;

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_spain_property_links",
      description:
        "Search the web (Tavily) for **individual property listing** URLs on allowed Spanish portals (direct ad pages, not agency sites or search index pages). Returns title, url, snippet, optional publishedAt; use only these urls in emit_listings. Set asset_focus and recency from user intent.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City in Spain (required)" },
          neighborhood: { type: "string", description: "Barrio / district when the user specifies it" },
          property_type: { type: "string", description: "Extra keywords e.g. piso, nave, local" },
          asset_focus: {
            type: "string",
            enum: [
              "residential",
              "commercial",
              "industrial",
              "land",
              "whole_building",
              "renovation_opportunity",
              "mixed",
            ],
            description:
              "Search profile: residential homes; commercial; industrial; land; whole_building; renovation_opportunity (reform/ruin); mixed broad",
          },
          recency: {
            type: "string",
            enum: ["any", "day", "week", "month", "year"],
            description:
              "Prefer newer indexed pages: week/month for últimos anuncios; day only if user asks very recent/today; any default",
          },
          transaction: {
            type: "string",
            enum: ["sale", "rent", "either"],
            description: "sale=venta, rent=alquiler, either=both",
          },
          max_results: { type: "number", description: "Number of listing URLs 1-12, default 8" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "geocode_place",
      description:
        "Geocode a place name or address in Spain (Nominatim). Results can be approximate; use a specific street address or unambiguous place for map pin quality. Vague queries may return unsuitable points.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Specific street address or clear place name in Spain (avoid vague area-only text)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_listing_page_metadata",
      description:
        "Fetch public metadata from a listing URL (allowed Spanish portals): title, description, listedBy (advertiser on page), pagePublishedAt. listedBy is not the legal registry owner.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS listing URL" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "emit_listings",
      description:
        "Register 1–12 listing cards. Always include sourceUrl. For search results: listingSource web_search, snippet, publishedAt if search returned it. After fetch_listing_page_metadata: include listedBy and publishedAt (from pagePublishedAt) when non-null. lat/lon only from geocode_place; mapHint area_center for neighborhood center only.",
      parameters: {
        type: "object",
        properties: {
          listings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                sourceUrl: { type: "string" },
                sourceName: { type: "string" },
                snippet: { type: "string", description: "Short excerpt from web search" },
                neighborhood: { type: "string", description: "Barrio context for this card" },
                listedBy: {
                  type: "string",
                  description: "Advertiser from listing page (agency etc.), not legal owner",
                },
                publishedAt: {
                  type: "string",
                  description: "Approximate date from search index or page metadata",
                },
                listingSource: {
                  type: "string",
                  enum: ["web_search", "portal_url"],
                },
                mapHint: {
                  type: "string",
                  enum: ["property", "area_center"],
                  description: "area_center = approximate neighborhood center, not exact building",
                },
                lat: { type: "number" },
                lon: { type: "number" },
              },
              required: ["title", "sourceUrl"],
            },
          },
        },
        required: ["listings"],
      },
    },
  },
];

type ChatRole = "user" | "assistant";

function sanitizeMessages(raw: unknown): { role: ChatRole; content: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const out: { role: ChatRole; content: string }[] = [];
  for (const item of raw) {
    if (out.length >= MAX_MESSAGES) break;
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim().slice(0, MAX_CONTENT_LENGTH);
    if (!trimmed) continue;
    out.push({ role, content: trimmed });
  }
  return out.length ? out : null;
}

async function runToolCall(
  name: string,
  argsJson: string,
  listingsAcc: SpainListingCard[],
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: "invalid_json_arguments" });
  }

  if (name === "search_spain_property_links") {
    const city = typeof args.city === "string" ? args.city : "";
    const tr = args.transaction;
    const transaction =
      tr === "rent" ? "rent" : tr === "sale" ? "sale" : ("either" as const);
    return searchSpainPropertyLinksJson({
      city,
      neighborhood: typeof args.neighborhood === "string" ? args.neighborhood : undefined,
      propertyType: typeof args.property_type === "string" ? args.property_type : undefined,
      transaction,
      maxResults: typeof args.max_results === "number" ? args.max_results : undefined,
      asset_focus: typeof args.asset_focus === "string" ? args.asset_focus : undefined,
      recency: typeof args.recency === "string" ? args.recency : undefined,
    });
  }
  if (name === "geocode_place") {
    const query = typeof args.query === "string" ? args.query : "";
    return geocodePlaceSpain(query);
  }
  if (name === "fetch_listing_page_metadata") {
    const url = typeof args.url === "string" ? args.url : "";
    return fetchListingPageMetadata(url);
  }
  if (name === "emit_listings") {
    return recordEmittedListings({ listings: args.listings }, listingsAcc);
  }
  return JSON.stringify({ error: "unknown_tool", name });
}

/** Whether OPENAI_API_KEY is set (never expose the key). */
export function handleSpainPropertySearchStatus(req: Request, res: Response): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }
  const openaiConfigured = Boolean((process.env.OPENAI_API_KEY || "").trim());
  const searchConfigured = isTavilySearchConfigured();
  res.json({ openaiConfigured, searchConfigured });
}

export async function handleSpainPropertySearchChat(req: Request, res: Response): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }

  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    res.status(503).json({
      message: "Configure OPENAI_API_KEY on the server to use Spain property search chat.",
    });
    return;
  }

  const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  const locale = req.body?.locale === "es" ? "es" : "en";
  const sanitized = sanitizeMessages(req.body?.messages);
  if (!sanitized) {
    res.status(400).json({ message: "Invalid or empty messages array" });
    return;
  }

  const last = sanitized[sanitized.length - 1];
  if (last.role !== "user") {
    res.status(400).json({ message: "Last message must be from user" });
    return;
  }

  const system = locale === "es" ? SYSTEM_PROMPT_ES : SYSTEM_PROMPT_EN;
  const listingsAcc: SpainListingCard[] = [];

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...sanitized.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 });
    let finalReply = "";
    let step = 0;

    while (step < MAX_AGENT_STEPS) {
      step += 1;
      const completion = await client.chat.completions.create({
        model,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.45,
        max_tokens: 2000,
      });

      const choice = completion.choices[0];
      const msg = choice?.message;
      if (!msg) {
        res.status(502).json({ message: "Empty choice from AI model" });
        return;
      }

      messages.push(msg);

      const toolCalls = msg.tool_calls;
      if (!toolCalls?.length) {
        finalReply = (msg.content || "").trim();
        break;
      }

      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;
        const fn = tc.function;
        const output = await runToolCall(fn.name, fn.arguments || "{}", listingsAcc);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: output.slice(0, 14_000),
        });
      }
    }

    if (!finalReply) {
      finalReply =
        locale === "es"
          ? "He procesado tu solicitud con las herramientas disponibles. Revisa las tarjetas de anuncios si aparecen abajo."
          : "I processed your request with the available tools. Check any listing cards below.";
    }

    const listings = dedupeListings(listingsAcc);
    res.json({ reply: finalReply, listings });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "OpenAI request failed";
    console.error("[spain-property-search/chat]", msg);
    res.status(502).json({ message: msg });
  }
}
