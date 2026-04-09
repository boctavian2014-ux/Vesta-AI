import type { Request, Response } from "express";
import OpenAI from "openai";
import {
  dedupeListings,
  fetchListingPageMetadata,
  geocodePlaceSpain,
  recordEmittedListings,
  type SpainListingCard,
} from "./spainPropertyListingTools";

const MAX_MESSAGES = 24;
const MAX_CONTENT_LENGTH = 8000;
const MAX_AGENT_STEPS = 8;

const SYSTEM_PROMPT_EN = `You are Vesta AI, a concise assistant for people searching for residential property in Spain (purchase focus unless the user asks about rent).

You have tools:
- geocode_place: resolve Spanish addresses or place names to coordinates (OpenStreetMap).
- fetch_listing_page_metadata: read public HTML metadata (title/description) from a listing URL on allowed portals only (Idealista, Fotocasa, Habitaclia, Pisos, YaEncontre, Milanuncios).
- emit_listings: register structured cards for the UI (title, sourceUrl, optional lat/lon, optional sourceName). Call this when the user pastes a listing URL, or after you used fetch_listing_page_metadata / geocode_place and have a concrete card.

Map / cadastre identification rules (critical):
- Vesta's map identifies a specific building for analysis only when there is enough location data. Put lat/lon on a card ONLY when you obtained them from geocode_place for a specific Spanish street address or unambiguous place (not vague "area X" guesses).
- Never invent or guess coordinates. If geocoding fails or the query is too vague, emit the card WITHOUT lat/lon.
- Emphasize listings that qualify for "Open on map" in your wording; for others, steer the user to the portal link or ask for a fuller address next time.
- In your final message, state clearly: without sufficient location data, Vesta cannot place an exact pin for cadastre-style identification; if there is no "Open on map" button, they should use the portal or provide a more complete address.

Other rules:
- For general strategy (budgets, neighborhoods, types), answer normally without claiming verified live availability.
- When the user provides a listing URL, call fetch_listing_page_metadata, then emit_listings with title from metadata (or a short title you derive) and the same URL. Use geocode_place only when the title/description contains a clear enough address or place in Spain to geocode; otherwise omit lat/lon.
- Never invent listing URLs. Prices from metadata may be stale — say the user should confirm on the portal.
- If asked outside Spain or unrelated topics, politely redirect to Spain property search.
- After using tools, give a short helpful final message to the user (plain text).`;

const SYSTEM_PROMPT_ES = `Eres Vesta AI, asistente breve para búsqueda de vivienda en España (compra; si piden alquiler, adapta).

Herramientas:
- geocode_place: coordenadas de direcciones o lugares en España (OpenStreetMap).
- fetch_listing_page_metadata: metadatos públicos (título/descripción) de una URL de anuncio en portales permitidos (Idealista, Fotocasa, Habitaclia, Pisos, YaEncontre, Milanuncios).
- emit_listings: registra tarjetas para la UI (title, sourceUrl, lat/lon opcionales, sourceName opcional). Úsalo si el usuario pega un enlace o tras usar las otras herramientas.

Reglas mapa / catastro (crítico):
- El mapa de Vesta solo puede identificar un inmueble concreto para análisis si hay datos de ubicación suficientes. Incluye lat/lon en la tarjeta SOLO si las obtuviste con geocode_place para una dirección específica en España o un lugar inequívoco (no adivines por títulos vagos tipo "zona X").
- Nunca inventes coordenadas. Si el geocodificado falla o la consulta es demasiado vaga, emite la tarjeta SIN lat/lon.
- Enfatiza los anuncios que sí califican para "Abrir en mapa"; en los demás, dirige al usuario al enlace del portal o pide una dirección más completa.
- En el mensaje final, deja claro: sin localización suficiente, Vesta no puede colocar un pin exacto para identificación tipo catastro; si no hay botón "Abrir en mapa", debe usar el portal o dar una dirección más completa.

Otras reglas:
- En temas generales (presupuesto, barrios, tipos), responde sin afirmar disponibilidad verificada en tiempo real.
- Si hay URL de anuncio, llama fetch_listing_page_metadata y luego emit_listings. Usa geocode_place solo si el título/descripción contiene una dirección o lugar en España lo bastante claro; si no, omite lat/lon.
- No inventes URLs. Los precios del HTML pueden estar desactualizados — indica que confirme en el portal.
- Fuera de España u otros temas: redirige con cortesía.
- Tras herramientas, mensaje final breve al usuario.`;

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
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
        "Fetch public Open Graph / title metadata from a single property listing URL (allowed Spanish portals only).",
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
        "Register 1–5 listing cards. Always include sourceUrl. Include lat/lon ONLY when geocode_place returned a usable point for a specific Spanish address or clear place; omit lat/lon if you did not geocode or the match was uncertain.",
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
  res.json({ openaiConfigured });
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
    const client = new OpenAI({ apiKey });
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
