import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUiLocale } from "@/lib/ui-locale";
import { App, Alert, Button, Card, Input } from "antd";
import { AlertTriangle, ExternalLink, Info, Loader2, MapPin, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export type SpainListingCardPayload = {
  title: string;
  sourceUrl: string;
  sourceName?: string;
  lat?: number;
  lon?: number;
  snippet?: string;
  neighborhood?: string;
  listingSource?: "web_search" | "portal_url";
  mapHint?: "property" | "area_center";
  /** Public advertiser on the listing page — not necessarily the legal owner */
  listedBy?: string;
  /** Search index or page metadata — approximate */
  publishedAt?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  listings?: SpainListingCardPayload[];
};

export default function PropertySearchChatPage() {
  const { locale } = useUiLocale();
  const [, navigate] = useLocation();
  const { message } = App.useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const pendingRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    document.documentElement.setAttribute("data-vesta-page", "property-search");
    return () => document.documentElement.removeAttribute("data-vesta-page");
  }, []);

  const { data: aiStatus } = useQuery({
    queryKey: ["spain-property-search-status"],
    queryFn: async () => {
      const r = await fetch("/api/spain-property-search/status", { credentials: "include" });
      if (!r.ok) return { openaiConfigured: false, searchConfigured: false };
      return (await r.json()) as { openaiConfigured: boolean; searchConfigured?: boolean };
    },
  });

  const t = useMemo(
    () =>
      locale === "es"
        ? {
            welcome:
              "Hola. Busco inmuebles en España: vivienda, locales, naves, terrenos, edificios enteros u oportunidades de reforma. Dime zona y tipo; para anuncios recientes pide «últimos anuncios». Si pegas un enlace de portal, intentamos mostrar anunciante y fechas públicas (no son el titular registral). «Abrir en mapa» solo con ubicación suficientemente concreta; si no, «Ver anuncio». Puedes usar las sugerencias abajo.",
            placeholder: "Describe lo que buscas en España…",
            send: "Enviar",
            sending: "Enviando…",
            chips: [
              "Pisos en venta en Valencia",
              "Últimos anuncios: pisos en venta en Madrid (esta semana)",
              "Local comercial en venta en Barcelona",
              "Nave industrial en Zaragoza",
              "Terreno en venta en Sevilla",
              "Pisos en venta en Málaga",
            ],
            errorTitle: "No se pudo obtener respuesta",
            networkError: "Error de red o del servidor. Inténtalo de nuevo.",
            openaiMissingTitle: "Chat IA no configurado",
            openaiMissingDesc:
              "En el servidor falta OPENAI_API_KEY (p. ej. en Railway → servicio vesta-web → Variables). Sin ella no hay respuestas del modelo.",
            openOnMap: "Abrir en mapa",
            viewListing: "Ver anuncio",
            coordsMissing:
              "Sin datos de ubicación suficientes no podemos colocar un pin exacto en el mapa de Vesta para identificar el inmueble. Abre el anuncio en el portal o escribe una dirección más completa en el chat.",
            mapInfoTitle: "Mapa e identificación",
            mapInfoDesc:
              "Solo los anuncios con localización fiable (p. ej. dirección geocodificada en España) muestran «Abrir en mapa». Los demás siguen disponibles con «Ver anuncio» en el portal.",
            searchMissingTitle: "Búsqueda de anuncios en internet no configurada",
            searchMissingDesc:
              "Para listar propiedades desde portales (Idealista, Fotocasa, etc.) hace falta TAVILY_API_KEY en el servidor (Railway → vesta-web → Variables). Sin ella el asistente solo puede usar enlaces que pegues tú.",
            webListingsDisclaimer:
              "Muestra de enlaces de búsqueda web (no todos los anuncios de España ni base de datos Vesta). Las fechas pueden ser orientativas (indexación). Comprueba precio, anunciante y disponibilidad en el portal.",
            listedByLabel: "Anunciante",
            publishedAtLabel: "Fecha (aprox.)",
            listedByFootnote:
              "Quien publica el anuncio en el portal no tiene por qué ser el titular registral.",
            openAreaOnMap: "Barrio en mapa (aprox.)",
          }
        : {
            welcome:
              "Hi. I help you find property in Spain: homes, commercial, industrial, land, whole buildings, or renovation plays. Say the area and asset type; ask for “latest listings” for recent ads. If you paste a portal link, we try to show public advertiser and dates (not the land-registry owner). Open on map only with enough location detail; otherwise use View listing. Try a suggestion below.",
            placeholder: "Describe what you are looking for in Spain…",
            send: "Send",
            sending: "Sending…",
            chips: [
              "Homes for sale in Valencia",
              "Latest listings: homes for sale in Madrid this week",
              "Commercial property for sale in Barcelona",
              "Industrial warehouse in Zaragoza",
              "Land for sale in Seville",
              "Apartments for sale in Málaga",
            ],
            errorTitle: "Could not get a reply",
            networkError: "Network or server error. Please try again.",
            openaiMissingTitle: "AI chat not configured",
            openaiMissingDesc:
              "OPENAI_API_KEY is missing on the server (e.g. Railway → vesta-web service → Variables). The model cannot reply until it is set.",
            openOnMap: "Open on map",
            viewListing: "View listing",
            coordsMissing:
              "Without enough location data we cannot place an exact pin on Vesta's map to identify the building. Open the listing on the portal or send a fuller address in chat.",
            mapInfoTitle: "Map and identification",
            mapInfoDesc:
              "Only listings with reliable location (e.g. a geocoded address in Spain) show Open on map. Others remain available via View listing on the portal.",
            searchMissingTitle: "Web listing search not configured",
            searchMissingDesc:
              "To list properties from portals (Idealista, Fotocasa, etc.), set TAVILY_API_KEY on the server (Railway → vesta-web → Variables). Without it, the assistant only works with links you paste.",
            webListingsDisclaimer:
              "Sample links from web search (not every listing in Spain or a Vesta database). Dates may be approximate (indexing). Confirm price, advertiser, and availability on the portal.",
            listedByLabel: "Listed by",
            publishedAtLabel: "Date (approx.)",
            listedByFootnote:
              "The portal advertiser is not necessarily the legal property owner.",
            openAreaOnMap: "Area on map (approx.)",
          },
    [locale],
  );

  useEffect(() => {
    setMessages([{ role: "assistant", content: t.welcome }]);
  }, [t.welcome]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  const sendWithText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pendingRef.current) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const historyPayload = [...messagesRef.current, userMsg];
      messagesRef.current = historyPayload;
      setMessages(historyPayload);
      setInput("");
      pendingRef.current = true;
      setPending(true);

      const abortCtl = new AbortController();
      const abortTimer = window.setTimeout(() => abortCtl.abort(), 120_000);
      try {
        const res = await fetch("/api/spain-property-search/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: historyPayload,
            locale,
          }),
          signal: abortCtl.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          reply?: string;
          listings?: SpainListingCardPayload[];
        };
        if (!res.ok) {
          throw new Error(data.message || res.statusText);
        }
        const reply = typeof data.reply === "string" ? data.reply : "";
        if (!reply) throw new Error(data.message || "Empty reply");
        const listings = Array.isArray(data.listings) ? data.listings : undefined;
        setMessages((prev) => [...prev, { role: "assistant", content: reply, listings }]);
      } catch (e: unknown) {
        const msg =
          e instanceof Error && e.name === "AbortError"
            ? locale === "es"
              ? "La solicitud tardó demasiado (2 min). Prueba de nuevo o una búsqueda más concreta (ciudad)."
              : "The request took too long (2 min). Try again or a more specific search (city)."
            : e instanceof Error
              ? e.message
              : t.networkError;
        message.error(`${t.errorTitle}: ${msg}`);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              locale === "es"
                ? "No pude generar una respuesta ahora. Revisa la configuración del servidor (OPENAI_API_KEY) o inténtalo de nuevo."
                : "I could not generate a reply right now. Check server configuration (OPENAI_API_KEY) or try again.",
          },
        ]);
      } finally {
        window.clearTimeout(abortTimer);
        pendingRef.current = false;
        setPending(false);
      }
    },
    [locale, t, message],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendWithText(input);
  };

  return (
    <div className="flex h-app-main flex-col bg-background">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8"
      >
        <div className="mx-auto max-w-3xl space-y-4 pb-4">
          {aiStatus && !aiStatus.openaiConfigured && (
            <Alert
              type="error"
              showIcon
              icon={<AlertTriangle className="h-4 w-4" />}
              message={t.openaiMissingTitle}
              description={t.openaiMissingDesc}
              className="border-destructive/40 bg-destructive/10"
            />
          )}
          {aiStatus?.openaiConfigured && (
            <Alert
              type="info"
              showIcon
              icon={<Info className="h-4 w-4" />}
              message={t.mapInfoTitle}
              description={t.mapInfoDesc}
              className="border-border bg-muted/40"
            />
          )}
          {aiStatus?.openaiConfigured && aiStatus.searchConfigured !== true && (
            <Alert
              type="warning"
              showIcon
              icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
              message={t.searchMissingTitle}
              description={t.searchMissingDesc}
              className="border-amber-500/40 bg-amber-500/10"
            />
          )}
          {messages.map((m, i) => (
            <div
              key={`${i}-${m.role}-${m.content.slice(0, 24)}`}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-card-foreground",
                )}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === "assistant" && m.listings && m.listings.length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    {m.listings.some((x) => x.listingSource === "web_search") ? (
                      <p className="text-xs text-muted-foreground leading-snug border border-border/80 rounded-lg px-3 py-2 bg-muted/30">
                        {t.webListingsDisclaimer}
                      </p>
                    ) : null}
                    {m.listings.map((c, idx) => {
                      const hasCoords =
                        typeof c.lat === "number" &&
                        typeof c.lon === "number" &&
                        Number.isFinite(c.lat) &&
                        Number.isFinite(c.lon);
                      const areaCenter = c.mapHint === "area_center";
                      return (
                        <Card key={`${c.sourceUrl}-${idx}`} className="bg-background/60" size="small" styles={{ body: { padding: 12 } }}>
                          <div className="space-y-2">
                            <p className="text-sm font-medium leading-snug text-foreground">
                              {c.title}
                            </p>
                            {c.neighborhood ? (
                              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {c.neighborhood}
                              </p>
                            ) : null}
                            {c.sourceName ? (
                              <p className="text-xs text-muted-foreground">{c.sourceName}</p>
                            ) : null}
                            {c.listedBy ? (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground/80">{t.listedByLabel}:</span>{" "}
                                {c.listedBy}
                              </p>
                            ) : null}
                            {c.publishedAt ? (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground/80">{t.publishedAtLabel}:</span>{" "}
                                {c.publishedAt}
                              </p>
                            ) : null}
                            {c.listedBy ? (
                              <p className="text-[11px] text-muted-foreground/90 leading-snug">{t.listedByFootnote}</p>
                            ) : null}
                            {c.snippet ? (
                              <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                                {c.snippet}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <Button
                                htmlType="button"
                                size="small"
                                icon={<ExternalLink className="h-3.5 w-3.5" />}
                                onClick={() => {
                                  window.open(c.sourceUrl, "_blank", "noopener,noreferrer");
                                }}
                              >
                                {t.viewListing}
                              </Button>
                              {hasCoords ? (
                                <Button
                                  htmlType="button"
                                  type="primary"
                                  size="small"
                                  icon={<MapPin className="h-3.5 w-3.5" />}
                                  onClick={() => {
                                    const q =
                                      areaCenter
                                        ? `lat=${encodeURIComponent(String(c.lat))}&lon=${encodeURIComponent(String(c.lon))}&area=1`
                                        : `lat=${encodeURIComponent(String(c.lat))}&lon=${encodeURIComponent(String(c.lon))}`;
                                    navigate(`/map?${q}`);
                                  }}
                                >
                                  {areaCenter ? t.openAreaOnMap : t.openOnMap}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground self-center">
                                  {t.coordsMissing}
                                </span>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.sending}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative z-20 shrink-0 border-t border-border bg-background px-4 py-3 md:px-8">
        <div className="mx-auto max-w-3xl space-y-3">
          <div className="flex flex-wrap gap-2">
            {t.chips.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={pending}
                onClick={() => void sendWithText(chip)}
                className="rounded-full border border-border bg-background/80 px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex gap-2 items-end">
            <Input.TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.placeholder}
              disabled={pending}
              rows={2}
              className="min-h-[3rem] resize-none bg-background"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendWithText(input);
                }
              }}
              aria-label={t.placeholder}
            />
            <Button htmlType="submit" type="primary" disabled={pending || !input.trim()} className="shrink-0 h-10">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {t.send}
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
