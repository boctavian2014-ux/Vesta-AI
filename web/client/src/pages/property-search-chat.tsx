import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHashLocation } from "wouter/use-hash-location";
import { useUiLocale } from "@/lib/ui-locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ExternalLink, Info, Loader2, MapPin, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export type SpainListingCardPayload = {
  title: string;
  sourceUrl: string;
  sourceName?: string;
  lat?: number;
  lon?: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  listings?: SpainListingCardPayload[];
};

export default function PropertySearchChatPage() {
  const { locale } = useUiLocale();
  const [, navigate] = useHashLocation();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
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
      if (!r.ok) return { openaiConfigured: false };
      return (await r.json()) as { openaiConfigured: boolean };
    },
  });

  const t = useMemo(
    () =>
      locale === "es"
        ? {
            welcome:
              "Hola. Soy tu asistente para buscar vivienda en España. Dime presupuesto, zona (ciudad o costa) y tipo: piso, chalet, estudio, terreno… Si pegas un enlace de Idealista o Fotocasa, lo resumimos; el botón «Abrir en mapa» solo aparece cuando hay una ubicación suficientemente concreta (p. ej. dirección geocodificada). Si no, usa «Ver anuncio» en el portal. También puedes usar las sugerencias abajo.",
            placeholder: "Describe lo que buscas en España…",
            send: "Enviar",
            sending: "Enviando…",
            chips: [
              "Piso hasta 250.000 € en Valencia",
              "Chalet cerca del mar en Málaga",
              "Estudio céntrico en Madrid",
              "Terreno urbanizable en la Costa Blanca",
              "Villa con piscina en Marbella, presupuesto flexible",
              "Casa 3 dormitorios, familia, zona tranquila Barcelona",
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
          }
        : {
            welcome:
              "Hi. I'm your assistant for finding property in Spain. Tell me your budget, area (city or coast), and type: apartment, villa, studio, land… If you paste an Idealista or Fotocasa link, we summarize it; Open on map only appears when there is enough location detail (e.g. a geocoded address). Otherwise use View listing on the portal. You can also tap a suggestion below.",
            placeholder: "Describe what you are looking for in Spain…",
            send: "Send",
            sending: "Sending…",
            chips: [
              "Apartment under €250k in Valencia",
              "Villa near the beach in Málaga",
              "Studio in central Madrid",
              "Building plot on the Costa Blanca",
              "Villa with pool in Marbella, flexible budget",
              "3-bed house for a family, quiet area Barcelona",
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
      if (!trimmed || pending) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const historyPayload = [...messagesRef.current, userMsg];
      setMessages(historyPayload);
      setInput("");
      setPending(true);

      try {
        const res = await fetch("/api/spain-property-search/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: historyPayload,
            locale,
          }),
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
        const msg = e instanceof Error ? e.message : t.networkError;
        toast({ title: t.errorTitle, description: msg, variant: "destructive" });
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
        setPending(false);
      }
    },
    [locale, pending, t, toast],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendWithText(input);
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col bg-background">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8"
      >
        <div className="mx-auto max-w-3xl space-y-4 pb-4">
          {aiStatus && !aiStatus.openaiConfigured && (
            <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t.openaiMissingTitle}</AlertTitle>
              <AlertDescription>{t.openaiMissingDesc}</AlertDescription>
            </Alert>
          )}
          {aiStatus?.openaiConfigured && (
            <Alert className="border-border bg-muted/40">
              <Info className="h-4 w-4" />
              <AlertTitle>{t.mapInfoTitle}</AlertTitle>
              <AlertDescription className="text-muted-foreground">{t.mapInfoDesc}</AlertDescription>
            </Alert>
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
                    {m.listings.map((c, idx) => {
                      const hasCoords =
                        typeof c.lat === "number" &&
                        typeof c.lon === "number" &&
                        Number.isFinite(c.lat) &&
                        Number.isFinite(c.lon);
                      return (
                        <Card key={`${c.sourceUrl}-${idx}`} className="bg-background/60">
                          <CardContent className="p-3 space-y-2">
                            <p className="text-sm font-medium leading-snug text-foreground">
                              {c.title}
                            </p>
                            {c.sourceName ? (
                              <p className="text-xs text-muted-foreground">{c.sourceName}</p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => {
                                  window.open(c.sourceUrl, "_blank", "noopener,noreferrer");
                                }}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {t.viewListing}
                              </Button>
                              {hasCoords ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => {
                                    navigate(
                                      `/map?lat=${encodeURIComponent(String(c.lat))}&lon=${encodeURIComponent(String(c.lon))}`,
                                    );
                                  }}
                                >
                                  <MapPin className="h-3.5 w-3.5" />
                                  {t.openOnMap}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground self-center">
                                  {t.coordsMissing}
                                </span>
                              )}
                            </div>
                          </CardContent>
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
            <Textarea
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
            <Button type="submit" disabled={pending || !input.trim()} className="shrink-0 h-10">
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
