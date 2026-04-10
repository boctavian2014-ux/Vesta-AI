import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { createCompletedDemoReport } from "@/lib/create-demo-report";
import { detectBrowserLocale } from "@/lib/locale";
import { useHashLocation } from "wouter/use-hash-location";
import { identifyProperty } from "@/lib/propertyApi";
import { getGoogleMapsBrowserKey, loadGoogleMapsJs } from "@/lib/googleMapsLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, Bookmark, FileText, X, Loader2,
  AlertCircle, CheckCircle2,
  CreditCard, Search,
  ScanLine,
} from "lucide-react";
import { VESTA_BRAND_ASSET_QUERY } from "@/components/vesta-brand-logo";
import { StreetViewModal } from "@/components/StreetViewModal";

/** Aliniat cu pachetele comerciale cerute: analysis 15 EUR, expert 50 EUR. */
const PRET_ANALYSIS_PACK_EUR =
  Number(import.meta.env.VITE_PRET_ANALYSIS_PACK_EUR) ||
  Number(import.meta.env.VITE_PRET_PROPERTY_ANALYSIS_EUR) ||
  15;
const PRET_EXPERT_EUR =
  Number(import.meta.env.VITE_PRET_RAPORT_EXPERT_EUR) ||
  Number(import.meta.env.VITE_PRET_EXPERT_EUR) ||
  50;
const MAP_UI_LOCALE_KEY = "vesta_map_ui_locale";
const PROPERTY_ANALYSIS_LOGO_SRC = `${import.meta.env.BASE_URL}vesta-logo.png${VESTA_BRAND_ASSET_QUERY}`;
/** Satellite close-up targets (Google may cap zoom by area). */
const MAP_STREET_ZOOM = 20;
const MAP_MAX_ZOOM = 22;

/** Parse `#/map?lat=&lon=` from the hash (e.g. deep link from property search). `area=1` = approximate neighborhood center. */
function parseMapCoordsFromHash(): { lat: number; lon: number; approxArea: boolean } | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  const q = hash.indexOf("?");
  if (q < 0) return null;
  const pathPart = hash.slice(0, q);
  if (!pathPart.includes("/map")) return null;
  const params = new URLSearchParams(hash.slice(q + 1));
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const approxArea = params.get("area") === "1";
  return { lat, lon, approxArea };
}

type UiLocale = "en" | "es";

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;


interface PropertyInfo {
  referenciaCatastral?: string;
  address?: string;
  municipio?: string;
  provincia?: string;
  superficie?: number | string;
  uso?: string;
  anoConstruccion?: number | string;
  oportunityScore?: number | string;
  [key: string]: any;
}

interface FinancialAnalysis {
  grossYield?: number | string;
  netYield?: number | string;
  roi?: number | string;
  opportunityScore?: number | string;
  pricePerSqm?: number | string;
  avgRentPerSqm?: number | string;
  estimatedValue?: number | string;
  monthlyRent?: number | string;
  valuationStatus?: string;
  valuationDiffPct?: number | null;
  negotiationNote?: string;
  annualCagrPct?: number | string;
  capitalAppreciation5yPct?: number | string;
  marketAvgSqm?: number | string | null;
  yieldVsBenchmark?: number | string | null;
  annualRentEstimate?: number | string | null;
  ineDataPoints?: number;
  dataSource?: string;
  ineCapitalAppreciationPct?: number | string | null;
  [key: string]: any;
}

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GoogleGeocoderViewport = {
  getNorthEast?: () => { lat?: (() => number) | number; lng?: (() => number) | number };
  getSouthWest?: () => { lat?: (() => number) | number; lng?: (() => number) | number };
  north?: number;
  south?: number;
  east?: number;
  west?: number;
  northeast?: { lat?: number; lng?: number };
  southwest?: { lat?: number; lng?: number };
} | Record<string, unknown>;

type GoogleGeocoderResult = {
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: {
    location?: {
      lat?: (() => number) | number;
      lng?: (() => number) | number;
    };
    viewport?: GoogleGeocoderViewport;
  };
};

type NominatimAddress = {
  country?: string;
  country_code?: string;
  state?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  road?: string;
  house_number?: string;
  postcode?: string;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  boundingbox?: string[];
  address?: NominatimAddress;
};

function makeAddressComponent(
  longName: string | undefined,
  shortName: string | undefined,
  types: string[]
): GoogleAddressComponent | null {
  const long = String(longName ?? "").trim();
  const short = String(shortName ?? "").trim();
  if (!long && !short) return null;
  return {
    long_name: long || short,
    short_name: short || long,
    types,
  };
}

function mapNominatimResultToGeocoderResult(row: NominatimResult): GoogleGeocoderResult | null {
  const lat = Number(row?.lat);
  const lon = Number(row?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const address = row.address ?? {};
  const cityLike = address.city || address.town || address.village || address.municipality;
  const components = [
    makeAddressComponent(address.country, (address.country_code || "").toUpperCase(), ["country"]),
    makeAddressComponent(address.state, undefined, ["administrative_area_level_1"]),
    makeAddressComponent(address.county, undefined, ["administrative_area_level_2"]),
    makeAddressComponent(cityLike, undefined, ["locality"]),
    makeAddressComponent(address.road, undefined, ["route"]),
    makeAddressComponent(address.house_number, undefined, ["street_number"]),
    makeAddressComponent(address.postcode, undefined, ["postal_code"]),
  ].filter(Boolean) as GoogleAddressComponent[];

  const bbox = Array.isArray(row.boundingbox) ? row.boundingbox : [];
  const south = Number(bbox[0]);
  const north = Number(bbox[1]);
  const west = Number(bbox[2]);
  const east = Number(bbox[3]);
  const viewport =
    Number.isFinite(north) && Number.isFinite(south) && Number.isFinite(east) && Number.isFinite(west)
      ? { north, south, east, west }
      : undefined;

  return {
    formatted_address: row.display_name,
    address_components: components,
    geometry: {
      location: { lat, lng: lon },
      viewport,
    },
  };
}

async function geocodeViaNominatim(query: string): Promise<{ status: string; results: GoogleGeocoderResult[] }> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&countrycodes=es&q=${encodeURIComponent(
    query
  )}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return { status: "ERROR", results: [] };
    }
    const payload = (await res.json()) as NominatimResult[] | unknown;
    if (!Array.isArray(payload) || payload.length === 0) {
      return { status: "ZERO_RESULTS", results: [] };
    }
    const mapped = payload
      .map((row) => mapNominatimResultToGeocoderResult(row))
      .filter(Boolean) as GoogleGeocoderResult[];
    return mapped.length ? { status: "OK", results: mapped } : { status: "ZERO_RESULTS", results: [] };
  } catch {
    return { status: "ERROR", results: [] };
  }
}

function resolveLatLngValue(value: unknown): number | null {
  if (typeof value === "function") {
    try {
      const result = (value as () => unknown)();
      return typeof result === "number" && Number.isFinite(result) ? result : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function getLatLonFromGeocodeResult(
  result: GoogleGeocoderResult | null | undefined
): { lat: number; lon: number } | null {
  const location = result?.geometry?.location;
  const lat = resolveLatLngValue(location?.lat);
  const lon = resolveLatLngValue(location?.lng);
  if (lat === null || lon === null) return null;
  return { lat, lon };
}

function normalizeViewportForFitBounds(
  viewport: GoogleGeocoderViewport | undefined
): { north: number; south: number; east: number; west: number } | null {
  if (!viewport) return null;
  const direct = viewport as {
    north?: unknown;
    south?: unknown;
    east?: unknown;
    west?: unknown;
    northeast?: { lat?: unknown; lng?: unknown };
    southwest?: { lat?: unknown; lng?: unknown };
  };
  const north = resolveLatLngValue(direct.north);
  const south = resolveLatLngValue(direct.south);
  const east = resolveLatLngValue(direct.east);
  const west = resolveLatLngValue(direct.west);
  if (north !== null && south !== null && east !== null && west !== null) {
    return { north, south, east, west };
  }

  const neLat = resolveLatLngValue(direct.northeast?.lat);
  const neLng = resolveLatLngValue(direct.northeast?.lng);
  const swLat = resolveLatLngValue(direct.southwest?.lat);
  const swLng = resolveLatLngValue(direct.southwest?.lng);
  if (neLat !== null && neLng !== null && swLat !== null && swLng !== null) {
    return { north: neLat, east: neLng, south: swLat, west: swLng };
  }

  const methodViewport = viewport as {
    getNorthEast?: () => { lat?: unknown; lng?: unknown };
    getSouthWest?: () => { lat?: unknown; lng?: unknown };
  };
  if (typeof methodViewport.getNorthEast === "function" && typeof methodViewport.getSouthWest === "function") {
    const ne = methodViewport.getNorthEast();
    const sw = methodViewport.getSouthWest();
    const methodNeLat = resolveLatLngValue(ne?.lat);
    const methodNeLng = resolveLatLngValue(ne?.lng);
    const methodSwLat = resolveLatLngValue(sw?.lat);
    const methodSwLng = resolveLatLngValue(sw?.lng);
    if (methodNeLat !== null && methodNeLng !== null && methodSwLat !== null && methodSwLng !== null) {
      return { north: methodNeLat, east: methodNeLng, south: methodSwLat, west: methodSwLng };
    }
  }

  return null;
}

function parseCoordinatesQuery(input: string): { lat: number; lon: number } | null {
  const cleaned = input.trim();
  const match = cleaned.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function isSpainGeocodeResult(result: GoogleGeocoderResult | null | undefined): boolean | null {
  const components = result?.address_components;
  if (!Array.isArray(components) || components.length === 0) return null;
  const countryComponent = components.find((component) =>
    Array.isArray(component.types) && component.types.includes("country")
  );
  if (!countryComponent) return null;
  const shortCountry = String(countryComponent.short_name ?? "").toUpperCase();
  if (shortCountry) return shortCountry === "ES";
  const longCountry = String(countryComponent.long_name ?? "").trim().toLowerCase();
  return longCountry === "spain" || longCountry === "españa" || longCountry === "espana";
}

function extractCityFromGeocodeResult(result: GoogleGeocoderResult | null | undefined): string | null {
  const components = result?.address_components;
  if (!Array.isArray(components) || components.length === 0) return null;

  const cityComponent =
    components.find((component) => Array.isArray(component.types) && component.types.includes("locality")) ||
    components.find((component) => Array.isArray(component.types) && component.types.includes("postal_town")) ||
    components.find((component) => Array.isArray(component.types) && component.types.includes("administrative_area_level_2")) ||
    components.find((component) => Array.isArray(component.types) && component.types.includes("administrative_area_level_1"));

  const value = String(cityComponent?.long_name ?? cityComponent?.short_name ?? "").trim();
  return value || null;
}

function isAddressLikeQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  // Heuristic: has digits/comma or common street tokens -> treat as address.
  return (
    /\d/.test(q) ||
    q.includes(",") ||
    /\b(calle|calleja|cl|avenida|av|plaza|pl|paseo|pg|carretera|cr|camino|cm|rua|ronda|street|st|road|rd|blvd|boulevard)\b/i.test(q)
  );
}

function isCityLikeResult(result: GoogleGeocoderResult | null | undefined): boolean {
  const components = result?.address_components;
  if (!Array.isArray(components) || components.length === 0) return false;
  const types = new Set(
    components.flatMap((component) => (Array.isArray(component.types) ? component.types : []))
  );
  const hasCitySignal =
    types.has("locality") ||
    types.has("administrative_area_level_2") ||
    types.has("administrative_area_level_1");
  const hasExactAddressSignal =
    types.has("street_number") ||
    types.has("route") ||
    types.has("premise") ||
    types.has("subpremise");
  return hasCitySignal && !hasExactAddressSignal;
}

// ── helpers ────────────────────────────────────────────────────────────────

function MetricRow({ label, value, highlight }: { label: string; value?: string | number | null; highlight?: boolean }) {
  const v = value !== undefined && value !== null && value !== "" ? String(value) : "—";
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-sidebar-border/50 last:border-0">
      <span className="text-sidebar-foreground/80 min-w-0 flex-1 text-sm font-medium leading-snug">{label}</span>
      <span
        className={`max-w-[58%] shrink-0 text-right text-sm font-bold tabular-nums leading-snug break-words ${
          highlight ? "text-[#7CFF32]" : "text-sidebar-foreground"
        }`}
      >
        {v}
      </span>
    </div>
  );
}

function ScoreBadge({ score }: { score?: number | string }) {
  if (!score) return null;
  const n = parseFloat(String(score));
  const cls = n >= 70 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : n >= 40 ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
    : "bg-red-500/15 text-red-400 border-red-500/30";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold ${cls}`}>
      Score: {n.toFixed(0)}/100
    </div>
  );
}

// ── Payment Modal ──────────────────────────────────────────────────────────

type ProductTier = "analysis_pack" | "expert_report";

function PaymentModalStripeForm({
  onPaid,
  onError,
  submitLabel,
}: {
  onPaid: () => void;
  onError: (msg: string) => void;
  submitLabel: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [paymentElementReady, setPaymentElementReady] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    const mountedPaymentElement = elements.getElement(PaymentElement);
    if (!mountedPaymentElement || !paymentElementReady) {
      onError("Payment form is not ready yet. Please wait a second and try again.");
      return;
    }
    setBusy(true);
    try {
      const submitResult = await elements.submit();
      if (submitResult.error) {
        onError(submitResult.error.message || "Payment form validation failed");
        setBusy(false);
        return;
      }
      const base = `${window.location.origin}${window.location.pathname || "/"}`;
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${base}#/map`,
        },
        redirect: "if_required",
      });
      if (error) {
        onError(error.message || "Payment failed");
        setBusy(false);
        return;
      }
      onPaid();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Payment failed");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement onReady={() => setPaymentElementReady(true)} />
      <Button
        type="submit"
        className="w-full gap-2"
        disabled={!stripe || busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}

function PaymentModal({
  open, onClose, onSuccess, propertyInfo, financialData, selectedCoords, fallbackCoords, uiLocale, initialTier,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (reportId: number) => void;
  propertyInfo: PropertyInfo | null;
  financialData: FinancialAnalysis | null;
  selectedCoords: { lat: number; lon: number } | null;
  fallbackCoords?: { lat: number; lon: number } | null;
  uiLocale: UiLocale;
  initialTier: ProductTier;
}) {
  const tr = uiLocale === "es"
    ? {
        missingCoords: "Faltan coordenadas",
        reselect: "Selecciona de nuevo el inmueble en el mapa.",
        payError: "Error de pago",
        incompletePayment: "Pago incompleto",
        missingPaymentId: "Falta el identificador del pago. Intenta de nuevo.",
        generationError: "Error al generar",
        timeout: "Tiempo agotado",
        timeoutDescription: "El pago aun no esta registrado o el informe no esta disponible.",
        reportFailed: "Informe fallido",
        retry: "Intenta de nuevo.",
        reportTimeout: "Tiempo de informe agotado",
        networkError: "Error de red",
        bulletsAnalysis1: "Analisis de propiedad + analisis financiero",
        bulletsAnalysis2: "Scor de oportunidad, rentabilidad, ROI y valoracion",
        bulletsAnalysis3: "Entrega en Informes con analisis de zona y mercado local",
        bulletsExpert1: "Incluye paquete de analisis + Nota Simple oficial",
        bulletsExpert2: "Informe experto AI: riesgos, resumen para inversor, due diligence",
        bulletsExpert3: "Soporte completo para decision de compra/inversion",
        orderDocs: "Solicitar paquete",
        twoPacks: "Dos paquetes: Analisis (15€) o Expert report + Nota Simple (50€).",
        catastroRef: "Referencia Catastro",
        choosePack: "Elige paquete",
        analysisTitle: "Analisis de propiedad + financiero",
        analysisSub: "Evaluacion AI: precio zona, vecinos, seguridad, servicios y rentabilidad",
        expertTitle: "Informe experto completo",
        expertSub: "Nota Simple oficial + analisis AI y due diligence",
        include: "Que incluye",
        total: "Total",
        paymentInit: "Inicializando pago...",
        registeringOrder: "Registrando paquete",
        generatingReport: "Generando informe",
        sendingRequest: "Procesando tu paquete de analisis",
        waitingAI: "Analisis AI del inmueble y de la zona en curso; puede tardar unos minutos",
        postPaymentFlow: "Proceso despues del pago",
        analysisFlow1: "Pago confirmado",
        analysisFlow2: "Analisis de zona: precio, servicios, seguridad y puntos de interes",
        analysisFlow3: "Informe final disponible en Informes",
        expertFlow1: "Pago confirmado",
        expertFlow2: "Solicitud de Nota Simple a colaboradores",
        expertFlow3: "PDF recibido y OCR legal extraido",
        expertFlow4: "Analisis AI experto en ejecucion",
        expertFlow5: "Informe final disponible en Informes",
        elapsed: "transcurridos",
        orderRegistered: "Paquete registrado",
        reportProgress: "Informe en curso / generado",
        analysisDelivered: "Tu analisis completo de propiedad y zona ya esta disponible en Informes.",
        notaDelivered: "La Nota Simple oficial se entregara por el flujo de colaboradores. Revisa en Informes.",
        redirecting: "Redirigiendo al detalle del informe...",
        cancel: "Cancelar",
        payNow: "Generar ahora",
        missingStripePk: "Falta VITE_STRIPE_PUBLISHABLE_KEY en el build. Anade la clave publica de Stripe.",
        securePay: "Pagar con tarjeta",
        backToPacks: "Volver a paquetes",
        previewDemo: "Ver demo del resultado (sin pago)",
        previewDemoHint: "Generacion temporal sin payment para validar entregable.",
        creatingDemo: "Creando demo del informe...",
      }
    : {
        missingCoords: "Missing coordinates",
        reselect: "Please reselect the property on the map.",
        payError: "Payment error",
        incompletePayment: "Incomplete payment",
        missingPaymentId: "Missing payment identifier. Please retry.",
        generationError: "Generation error",
        timeout: "Timeout",
        timeoutDescription: "Payment is not registered yet or the report is unavailable.",
        reportFailed: "Report failed",
        retry: "Please retry.",
        reportTimeout: "Report timeout",
        networkError: "Network error",
        bulletsAnalysis1: "Property analysis + financial analysis",
        bulletsAnalysis2: "Opportunity score, yield, ROI, valuation snapshot",
        bulletsAnalysis3: "Delivered in Reports with local zone and market analysis",
        bulletsExpert1: "Includes analysis pack + official Nota Simple",
        bulletsExpert2: "AI expert report: risk review, investor summary, due diligence",
        bulletsExpert3: "Full package for acquisition/investment decision",
        orderDocs: "Order package",
        twoPacks: "Two packages: Analysis (15€) or Expert report + Nota Simple (50€).",
        catastroRef: "Catastro reference",
        choosePack: "Choose package",
        analysisTitle: "Property + financial analysis",
        analysisSub: "AI evaluation: local pricing, neighborhood, safety, services and returns",
        expertTitle: "Full expert report",
        expertSub: "Official Nota Simple + AI analysis and due diligence",
        include: "Includes",
        total: "Total",
        paymentInit: "Initializing payment...",
        registeringOrder: "Registering package",
        generatingReport: "Generating report",
        sendingRequest: "Processing your analysis package",
        waitingAI: "AI property and zone analysis in progress — this may take a few minutes",
        postPaymentFlow: "Post-payment process",
        analysisFlow1: "Payment confirmed",
        analysisFlow2: "Zone analysis: pricing, services, safety and points of interest",
        analysisFlow3: "Final report available in Reports",
        expertFlow1: "Payment confirmed",
        expertFlow2: "Nota Simple requested via collaborators",
        expertFlow3: "PDF received and legal OCR extracted",
        expertFlow4: "Expert AI analysis in progress",
        expertFlow5: "Final report available in Reports",
        elapsed: "elapsed",
        orderRegistered: "Package registered",
        reportProgress: "Report in progress / generated",
        analysisDelivered: "Your full property + zone analysis is now available in Reports.",
        notaDelivered: "The official Nota Simple will be delivered via collaborators flow. Track it in Reports.",
        redirecting: "Redirecting to report details...",
        cancel: "Cancel",
        payNow: "Generate now",
        missingStripePk: "Missing VITE_STRIPE_PUBLISHABLE_KEY in the build. Add your Stripe publishable key.",
        securePay: "Pay securely",
        backToPacks: "Back to packages",
        previewDemo: "Preview deliverable (no payment)",
        previewDemoHint: "Temporary no-payment generation to validate the deliverable.",
        creatingDemo: "Creating report preview...",
      };

  const { toast } = useToast();
  const [step, setStep] = useState<"confirm" | "paying" | "payment" | "processing" | "done">("confirm");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [tier, setTier] = useState<ProductTier>("analysis_pack");
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qc = useQueryClient();

  const priceForTier = tier === "expert_report" ? PRET_EXPERT_EUR : PRET_ANALYSIS_PACK_EUR;
  const resolvedCoords = selectedCoords ?? fallbackCoords ?? null;

  // Reset when opened; clear poll timer when modal closes
  useEffect(() => {
    if (open) {
      setStep("confirm");
      setClientSecret(null);
      setPaymentIntentId(null);
      setPollCount(0);
      setTier(initialTier);
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, [open, initialTier]);

  // Step 1: create payment intent
  const startPayment = async () => {
    await startDemoPreview();
  };

  const confirmAndProcess = async (productTier: ProductTier, pi: string | null) => {
    if (!pi) {
      toast({
        title: tr.incompletePayment,
        description: tr.missingPaymentId,
        variant: "destructive",
      });
      setStep("confirm");
      return;
    }
    try {
      setStep("processing");
      const reportRes = await apiRequest("POST", "/api/reports", {
        type: productTier === "analysis_pack" ? "analysis_pack" : "expert_report",
        status: "processing",
        referenciaCatastral: propertyInfo?.referenciaCatastral ?? "",
        address: propertyInfo?.address ?? "",
        cadastralJson: JSON.stringify(propertyInfo ?? {}),
        financialJson: JSON.stringify(financialData ?? {}),
      });
      const report = await reportRes.json();

      await apiRequest("PATCH", `/api/reports/${report.id}`, {
        stripeSessionId: pi,
      });
      pollPaymentFlowStatus(pi, report.id);
    } catch (err: any) {
      toast({ title: tr.generationError, description: err.message, variant: "destructive" });
      setStep("confirm");
    }
  };

  const startDemoPreview = async () => {
    if (!resolvedCoords) {
      toast({ title: tr.missingCoords, description: tr.reselect, variant: "destructive" });
      return;
    }
    setStep("paying");
    try {
      const report = await createCompletedDemoReport(tier, {
        locale: uiLocale,
        coords: resolvedCoords,
        propertyInfo: propertyInfo ?? {},
        financialData: financialData ?? {},
      });
      qc.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({ title: tr.creatingDemo, description: tr.previewDemoHint });
      setStep("done");
      onSuccess(report.id);
    } catch (err: any) {
      toast({ title: tr.payError, description: err?.message ?? "Demo failed", variant: "destructive" });
      setStep("confirm");
    }
  };

  /** Waits for Stripe webhook -> Nota Simple -> AI job (Python backend), not empty /report/generate-async. */
  const pollPaymentFlowStatus = async (pi: string, rid: number) => {
    let attempts = 0;
    const maxAttempts = 120;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const interval = setInterval(async () => {
      attempts++;
      setPollCount(attempts);
      try {
        const res = await fetch(`/api/payment-flow/status/${encodeURIComponent(pi)}`, {
          credentials: "include",
        });
        if (res.status === 404) {
          clearInterval(interval);
          pollTimerRef.current = null;
          await apiRequest("PATCH", `/api/reports/${rid}`, { status: "failed" }).catch(() => {});
          toast({
            title: tr.timeout,
            description: tr.timeoutDescription,
            variant: "destructive",
          });
          onClose();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "failed" || data.ai_job_status === "failed") {
          clearInterval(interval);
          pollTimerRef.current = null;
          await apiRequest("PATCH", `/api/reports/${rid}`, { status: "failed" });
          toast({ title: tr.reportFailed, description: tr.retry, variant: "destructive" });
          onClose();
          return;
        }
        if (data.report || data.client_ready) {
          clearInterval(interval);
          pollTimerRef.current = null;
          const patch: Record<string, string> = { status: "completed" };
          if (data.report) {
            patch.reportJson = JSON.stringify(data.report);
          }
          if (data.nota_simple_extracted && typeof data.nota_simple_extracted === "object") {
            patch.notaSimpleJson = JSON.stringify(data.nota_simple_extracted);
          }
          if (typeof data.ai_job_id === "string" && data.ai_job_id) {
            patch.stripeJobId = data.ai_job_id;
          }
          await apiRequest("PATCH", `/api/reports/${rid}`, patch);
          qc.invalidateQueries({ queryKey: ["/api/reports"] });
          qc.invalidateQueries({ queryKey: ["/api/reports", rid] });
          setStep("done");
          onSuccess(rid);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          pollTimerRef.current = null;
          await apiRequest("PATCH", `/api/reports/${rid}`, { status: "failed" });
          toast({ title: tr.reportTimeout, description: tr.retry, variant: "destructive" });
          onClose();
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          pollTimerRef.current = null;
          await apiRequest("PATCH", `/api/reports/${rid}`, { status: "failed" }).catch(() => {});
          toast({ title: tr.networkError, variant: "destructive" });
          onClose();
        }
      }
    }, 4000);
    pollTimerRef.current = interval;
  };

  const analysisBullets = [
    tr.bulletsAnalysis1,
    tr.bulletsAnalysis2,
    tr.bulletsAnalysis3,
  ];
  const expertBullets = [
    tr.bulletsExpert1,
    tr.bulletsExpert2,
    tr.bulletsExpert3,
  ];
  const processingSteps =
    tier === "analysis_pack"
      ? [tr.analysisFlow1, tr.analysisFlow2, tr.analysisFlow3]
      : [tr.expertFlow1, tr.expertFlow2, tr.expertFlow3, tr.expertFlow4, tr.expertFlow5];
  const activeProcessingStep =
    tier === "analysis_pack"
      ? pollCount >= 6
        ? 2
        : pollCount >= 2
          ? 1
          : 0
      : pollCount >= 22
        ? 4
        : pollCount >= 14
          ? 3
          : pollCount >= 8
            ? 2
            : pollCount >= 3
              ? 1
              : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={step === "payment" ? "sm:max-w-lg" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {tr.orderDocs}
          </DialogTitle>
          <DialogDescription>
            {tr.twoPacks}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {propertyInfo?.referenciaCatastral && (
            <div className="rounded-lg glass-panel px-3 py-2.5 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{tr.catastroRef}</p>
              <p className="text-sm font-bold text-primary font-mono">{propertyInfo.referenciaCatastral}</p>
              {propertyInfo.address && <p className="text-xs text-muted-foreground">{propertyInfo.address}</p>}
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{tr.choosePack}</p>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setTier("analysis_pack")}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    tier === "analysis_pack"
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{tr.analysisTitle}</span>
                    <span className="text-sm font-bold text-primary">{PRET_ANALYSIS_PACK_EUR} €</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{tr.analysisSub}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setTier("expert_report")}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    tier === "expert_report"
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{tr.expertTitle}</span>
                    <span className="text-sm font-bold text-primary">{PRET_EXPERT_EUR} €</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{tr.expertSub}</p>
                </button>
              </div>
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{tr.include}</p>
                {(tier === "analysis_pack" ? analysisBullets : expertBullets).map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs text-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm text-muted-foreground">{tr.total}</span>
                <span className="text-lg font-bold text-foreground">{priceForTier} €</span>
              </div>
            </div>
          )}

          {step === "paying" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">{tr.paymentInit}</p>
            </div>
          )}

          {step === "payment" && clientSecret && stripePromise && paymentIntentId && (
            <div className="space-y-3 py-1">
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: { theme: "stripe", variables: { colorPrimary: "hsl(38, 70%, 50%)" } },
                }}
              >
                <PaymentModalStripeForm
                  submitLabel={`${tr.securePay} · ${priceForTier} €`}
                  onPaid={() => void confirmAndProcess(tier, paymentIntentId)}
                  onError={(msg) => {
                    toast({ title: tr.payError, description: msg, variant: "destructive" });
                  }}
                />
              </Elements>
              <Button
                variant="outline"
                type="button"
                className="w-full"
                onClick={() => {
                  setStep("confirm");
                  setClientSecret(null);
                  setPaymentIntentId(null);
                }}
              >
                {tr.backToPacks}
              </Button>
            </div>
          )}

          {step === "processing" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <div className="text-center max-w-md">
                <p className="text-sm font-semibold text-foreground">
                  {tier === "analysis_pack" ? tr.registeringOrder : tr.generatingReport}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tier === "analysis_pack"
                    ? tr.sendingRequest
                    : tr.waitingAI}
                </p>
              </div>
              <div className="w-full rounded-lg glass-panel p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {tr.postPaymentFlow}
                </p>
                <div className="space-y-1.5">
                  {processingSteps.map((label, idx) => {
                    const done = idx < activeProcessingStep;
                    const active = idx === activeProcessingStep;
                    return (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        {done ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : active ? (
                          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border border-border shrink-0" />
                        )}
                        <span className={done ? "text-foreground" : "text-muted-foreground"}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(95, (pollCount / 120) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{pollCount * 4}s {tr.elapsed}...</p>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              <p className="text-sm font-semibold text-foreground">
                {tier === "analysis_pack" ? tr.orderRegistered : tr.reportProgress}
              </p>
              <p className="text-xs text-muted-foreground">
                {tier === "analysis_pack"
                  ? tr.analysisDelivered
                  : tr.redirecting}
              </p>
            </div>
          )}
        </div>

        {step === "confirm" && (
          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">{tr.cancel}</Button>
              <Button onClick={startPayment} className="flex-1 gap-2">
                <CreditCard className="h-4 w-4" />
                {tr.payNow} {priceForTier} €
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">{tr.previewDemoHint}</p>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}

// ── Main Map Page ──────────────────────────────────────────────────────────

export default function MapPage() {
  const googleMapContainerRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<any>(null);
  const googleMarkerRef = useRef<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useHashLocation();
  const mapDeepLinkConsumedRef = useRef(false);

  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [propertyInfo, setPropertyInfo] = useState<PropertyInfo | null>(null);
  const [financialData, setFinancialData] = useState<FinancialAnalysis | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalTier, setPaymentModalTier] = useState<ProductTier>("analysis_pack");
  const [mapInitError, setMapInitError] = useState<string | null>(null);
  const [mapReloadToken, setMapReloadToken] = useState(0);
  const [streetViewOpen, setStreetViewOpen] = useState(false);
  const [streetViewLat, setStreetViewLat] = useState<number | null>(null);
  const [streetViewLng, setStreetViewLng] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [uiLocale, setUiLocale] = useState<UiLocale>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(MAP_UI_LOCALE_KEY);
      if (saved === "en" || saved === "es") return saved;
    }
    return detectBrowserLocale() === "es" ? "es" : "en";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MAP_UI_LOCALE_KEY, uiLocale);
    }
  }, [uiLocale]);

  const fallbackCoordsFromMapCenter = (() => {
    try {
      const center = googleMapRef.current?.getCenter?.();
      if (!center) return null;
      const lat = Number(center.lat?.());
      const lon = Number(center.lng?.());
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon };
    } catch {
      return null;
    }
  })();

  const t = uiLocale === "es"
    ? {
        searchPlaceholder: "Buscar ciudad, direccion o lat,lon (Spain)",
        searchButton: "Buscar",
        streetViewButton: "Street View",
        streetViewSelectPointFirst: "Selecciona un punto en el mapa primero",
        searchingLocation: "Buscando ubicacion...",
        searchEmpty: "Escribe una ciudad, direccion o coordenadas.",
        searchNoResult: "No encontramos resultados para esa busqueda.",
        searchError: "No se pudo completar la busqueda.",
        addressOtherCity: "La direccion no corresponde: es de otra ciudad.",
        outsideSpainWarning: "Resultado fuera de Espana (se permite continuar).",
        propertyAnalysis: "Analisis de propiedad",
        queryingCatastro: "Consultando Catastro...",
        noBuildingTitle: "No se encontro edificio",
        noBuildingDesc: "No se encontro edificio en ese punto. Prueba otra zona o aumenta el zoom.",
        catastroRef: "Referencia Catastro",
        propertyData: "Datos del inmueble",
        address: "Direccion",
        municipality: "Municipio",
        province: "Provincia",
        area: "Superficie",
        usage: "Uso",
        yearBuilt: "Ano de construccion",
        aiFinancial: "Analisis financiero AI para este inmueble",
        financialAnalysis: "Analisis financiero",
        expertAnalysisOrder: "Informe experto",
        calculatingYield: "Calculando rentabilidad...",
        financialSection: "Analisis financiero",
        grossYield: "Rentabilidad bruta",
        netYield: "Rentabilidad neta",
        roi5y: "ROI 5 años (modelo)",
        pricePerSqm: "Precio/m²",
        estimatedValue: "Precio asumido (modelo)",
        monthlyRent: "Alquiler mensual est.",
        annualRent: "Alquiler anual est.",
        zoneAvgPerSqm: "Zona media venta €/m²",
        zoneRentPerSqm: "Zona alquiler €/m²/mes",
        valuationVsMarket: "Valoracion vs mercado",
        vsMarketPct: "vs mercado (%)",
        negotiationNote: "Nota negociacion",
        marketCagr: "CAGR mercado (INE)",
        capApp5y: "Apreciacion capital 5 años",
        yieldVsSpain: "Rent. vs media Espana",
        ineTrendPoints: "Puntos tendencia INE",
        dataSource: "Fuente datos",
        ineCapApp: "Apreciacion INE (serie)",
        saveProperty: "Guardar propiedad",
        noBuildingError: "No se encontro edificio en ese punto.",
        analysisFailed: "Analisis fallido",
        retryAnalysis: "Reintentar analisis",
        propertySaved: "Propiedad guardada",
        genericError: "Error",
        selectedProperty: "Inmueble seleccionado",
        mapUnavailable: "Mapa no disponible",
        mapInitFailed: "No pudimos iniciar Google Maps.",
        mapRetry: "Reintentar mapa",
        missingMapKey: "Falta VITE_GOOGLE_MAPS_JS_API_KEY.",
        mapAuthFailed: "Google Maps rechazo la clave API (verifica restricciones de dominio y facturacion).",
        areaMapToastTitle: "Zona aproximada",
        areaMapToastDesc:
          "Este punto es un centro orientativo del barrio (geocodificado), no un inmueble concreto. Comprueba en el portal o en el mapa antes de analizar.",
      }
    : {
        searchPlaceholder: "Search city, address or lat,lon (Spain)",
        searchButton: "Search",
        streetViewButton: "Street View",
        streetViewSelectPointFirst: "Select a point on the map first",
        searchingLocation: "Searching location...",
        searchEmpty: "Enter a city, address, or coordinates.",
        searchNoResult: "No results found for this query.",
        searchError: "Could not complete search.",
        addressOtherCity: "Address does not match current city; it belongs to a different city.",
        outsideSpainWarning: "Result is outside Spain (continuing anyway).",
        propertyAnalysis: "Property analysis",
        queryingCatastro: "Querying Catastro...",
        noBuildingTitle: "No building found",
        noBuildingDesc: "No building found at this location. Try another area or zoom in.",
        catastroRef: "Catastro reference",
        propertyData: "Property data",
        address: "Address",
        municipality: "Municipality",
        province: "Province",
        area: "Area",
        usage: "Usage",
        yearBuilt: "Year built",
        aiFinancial: "AI financial analysis for this property",
        financialAnalysis: "Financial analysis",
        expertAnalysisOrder: "Expert analysis",
        calculatingYield: "Calculating yield...",
        financialSection: "Financial analysis",
        grossYield: "Gross yield",
        netYield: "Net yield",
        roi5y: "5-year ROI (model)",
        pricePerSqm: "Price/m²",
        estimatedValue: "Assumed list price (model)",
        monthlyRent: "Est. monthly rent",
        annualRent: "Est. annual rent",
        zoneAvgPerSqm: "Zone avg sale €/m²",
        zoneRentPerSqm: "Zone rent €/m²/mo",
        valuationVsMarket: "Valuation vs market",
        vsMarketPct: "vs market (%)",
        negotiationNote: "Negotiation note",
        marketCagr: "Market CAGR (INE)",
        capApp5y: "5y capital appreciation",
        yieldVsSpain: "Yield vs Spain avg.",
        ineTrendPoints: "INE trend points",
        dataSource: "Data source",
        ineCapApp: "INE series appreciation",
        saveProperty: "Save property",
        noBuildingError: "No building found at this location.",
        analysisFailed: "Analysis failed",
        retryAnalysis: "Retry analysis",
        propertySaved: "Property saved",
        genericError: "Error",
        selectedProperty: "Selected property",
        mapUnavailable: "Map unavailable",
        mapInitFailed: "We could not initialize Google Maps.",
        mapRetry: "Retry map",
        missingMapKey: "Missing VITE_GOOGLE_MAPS_JS_API_KEY.",
        mapAuthFailed: "Google Maps rejected the API key (check referrer restrictions and billing).",
        areaMapToastTitle: "Approximate area",
        areaMapToastDesc:
          "This pin is a neighborhood center for orientation (geocoded), not a specific building. Confirm on the portal or map before running analysis.",
      };

  useEffect(() => {
    const win = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailureHandler = win.gm_authFailure;
    win.gm_authFailure = () => {
      setMapInitError(t.mapAuthFailed);
      if (typeof previousAuthFailureHandler === "function") {
        previousAuthFailureHandler();
      }
    };
    return () => {
      win.gm_authFailure = previousAuthFailureHandler;
    };
  }, [t.mapAuthFailed]);

  const openStreetView = useCallback(() => {
    if (!selectedCoords) {
      toast({ title: t.streetViewSelectPointFirst, variant: "destructive" });
      return;
    }
    setStreetViewLat(selectedCoords.lat);
    setStreetViewLng(selectedCoords.lon);
    setStreetViewOpen(true);
  }, [selectedCoords, t.streetViewSelectPointFirst, toast]);

  // ── mutations ──────────────────────────────────────────────────────────

  const financialMutation = useMutation({
    mutationFn: async (payload: PropertyInfo) => {
      const res = await apiRequest("POST", "/api/property/financial-analysis", payload);
      return res.json() as FinancialAnalysis;
    },
    onSuccess: (data) => setFinancialData(data),
    onError: (err: any) => toast({ title: t.analysisFailed, description: err.message, variant: "destructive" }),
  });

  const identifyMutation = useMutation({
    mutationFn: async ({ lat, lon }: { lat: number; lon: number }) => {
      return identifyProperty(lat, lon);
    },
    onSuccess: (data) => {
      setPropertyInfo(data);
      setIdentifyError(null);
      // Financial analysis is unlocked after payment (analysis pack).
    },
    onError: () => {
      setIdentifyError(t.noBuildingError);
      setPropertyInfo(null);
    },
  });

  const beginPropertySelection = useCallback(
    (lat: number, lon: number) => {
      setSelectedCoords({ lat, lon });
      setPropertyInfo(null);
      setFinancialData(null);
      setIdentifyError(null);
      setPanelOpen(true);

      const g = (typeof window !== "undefined" ? (window as any).google : null)?.maps;
      const gm = googleMapRef.current;
      if (g?.Marker && gm) {
        if (googleMarkerRef.current) {
          googleMarkerRef.current.setPosition({ lat, lng: lon });
          googleMarkerRef.current.setMap(gm);
        } else {
          googleMarkerRef.current = new g.Marker({
            position: { lat, lng: lon },
            map: gm,
          });
        }
      }

      identifyMutation.mutate({ lat, lon });
    },
    [identifyMutation],
  );

  const beginPropertySelectionRef = useRef(beginPropertySelection);
  beginPropertySelectionRef.current = beginPropertySelection;

  const selectedCoordsRef = useRef(selectedCoords);
  selectedCoordsRef.current = selectedCoords;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/properties", {
        referenciaCatastral: propertyInfo?.referenciaCatastral,
        address: propertyInfo?.address,
        lat: String(selectedCoords?.lat ?? ""),
        lon: String(selectedCoords?.lon ?? ""),
        pricePerSqm: String(financialData?.pricePerSqm ?? ""),
        avgRentPerSqm: String(financialData?.avgRentPerSqm ?? ""),
        grossYield: String(financialData?.grossYield ?? ""),
        netYield: String(financialData?.netYield ?? ""),
        roi: String(financialData?.roi ?? ""),
        opportunityScore: String(financialData?.opportunityScore ?? ""),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: t.propertySaved });
    },
    onError: (err: any) => toast({ title: t.genericError, description: err.message, variant: "destructive" }),
  });

  // ── Google Maps — satellite only + Street View modal ─────────────────────

  useLayoutEffect(() => {
    const key = getGoogleMapsBrowserKey();
    const container = googleMapContainerRef.current;
    if (!container) return;
    if (!key) {
      setMapInitError(t.missingMapKey);
      return;
    }

    let cancelled = false;
    setMapInitError(null);
    const initTimeout = window.setTimeout(() => {
      if (!cancelled && !googleMapRef.current) {
        setMapInitError(t.mapInitFailed);
      }
    }, 10000);

    loadGoogleMapsJs(key).then(() => {
      if (cancelled || !googleMapContainerRef.current) return;
      const g = (window as any).google?.maps;
      if (!g?.Map) {
        setMapInitError(t.mapInitFailed);
        return;
      }

      if (!googleMapRef.current) {
        googleMapRef.current = new g.Map(googleMapContainerRef.current, {
          center: { lat: 40.4168, lng: -3.7038 },
          zoom: MAP_STREET_ZOOM,
          mapTypeId: g.MapTypeId.SATELLITE,
          tilt: 45,
          maxZoom: MAP_MAX_ZOOM,
          rotateControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        });
        googleMapRef.current.addListener("click", (e: any) => {
          if (googleMapRef.current?.setTilt) {
            googleMapRef.current.setTilt(45);
          }
          if (e.latLng) beginPropertySelectionRef.current(e.latLng.lat(), e.latLng.lng());
        });
      } else if (googleMapRef.current?.setOptions) {
        googleMapRef.current.setMapTypeId(g.MapTypeId.SATELLITE);
        googleMapRef.current.setTilt(45);
        googleMapRef.current.setOptions({
          maxZoom: MAP_MAX_ZOOM,
          rotateControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        });
      }
      setMapInitError(null);

      if (!mapDeepLinkConsumedRef.current && googleMapRef.current) {
        const deep = parseMapCoordsFromHash();
        if (deep) {
          mapDeepLinkConsumedRef.current = true;
          googleMapRef.current.setCenter({ lat: deep.lat, lng: deep.lon });
          googleMapRef.current.setZoom(MAP_STREET_ZOOM);
          queueMicrotask(() => {
            beginPropertySelectionRef.current(deep.lat, deep.lon);
            if (deep.approxArea) {
              toast({
                title: t.areaMapToastTitle,
                description: t.areaMapToastDesc,
                duration: 9000,
              });
            }
          });
        }
      }

      const sel = selectedCoordsRef.current;
      if (sel && googleMapRef.current && g.Marker) {
        if (googleMarkerRef.current) {
          googleMarkerRef.current.setPosition({ lat: sel.lat, lng: sel.lon });
          googleMarkerRef.current.setMap(googleMapRef.current);
        } else {
          googleMarkerRef.current = new g.Marker({
            position: { lat: sel.lat, lng: sel.lon },
            map: googleMapRef.current,
          });
        }
      }
    }).catch((err: unknown) => {
      if (!cancelled) {
        const errorDetails = err instanceof Error ? err.message : "";
        setMapInitError(
          errorDetails ? `${t.mapInitFailed} (${errorDetails})` : t.mapInitFailed
        );
      }
    }).finally(() => {
      window.clearTimeout(initTimeout);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(initTimeout);
    };
  }, [mapReloadToken, t.mapInitFailed, t.missingMapKey]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPropertyInfo(null);
    setFinancialData(null);
    setSelectedCoords(null);
    setIdentifyError(null);
    if (googleMarkerRef.current) {
      googleMarkerRef.current.setMap(null);
      googleMarkerRef.current = null;
    }
  }, []);

  const isIdentifying = identifyMutation.isPending;

  const runSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      toast({ title: t.searchEmpty, variant: "destructive" });
      return;
    }
    const g = (window as any).google?.maps;
    const gm = googleMapRef.current;
    if (!g || !gm) {
      toast({ title: t.mapInitFailed, variant: "destructive" });
      return;
    }

    setSearchBusy(true);
    try {
      const coordinateHit = parseCoordinatesQuery(query);
      if (coordinateHit) {
        gm.setCenter({ lat: coordinateHit.lat, lng: coordinateHit.lon });
        gm.setZoom(MAP_STREET_ZOOM);

        const geocoder = new g.Geocoder();
        const reverse = await new Promise<{ results: GoogleGeocoderResult[]; status: string }>(
          (resolve) => {
            geocoder.geocode(
              { location: { lat: coordinateHit.lat, lng: coordinateHit.lon } },
              (results: GoogleGeocoderResult[] = [], status: string) => resolve({ results, status })
            );
          }
        );
        if (reverse.status === "OK" && reverse.results?.length) {
          const inSpain = isSpainGeocodeResult(reverse.results[0]);
          if (inSpain === false) {
            toast({ title: t.outsideSpainWarning });
          }
        }
        return;
      }

      const geocoder = new g.Geocoder();
      const geocodeOnce = (request: Record<string, unknown>) =>
        new Promise<{ results: GoogleGeocoderResult[]; status: string }>((resolve) => {
          geocoder.geocode(
            request,
            (results: GoogleGeocoderResult[] = [], status: string) => resolve({ results, status })
          );
        });

      let geocodeResult = await geocodeOnce({
        address: query,
        region: "es",
        componentRestrictions: { country: "ES" },
      });

      if (geocodeResult.status !== "OK" || !geocodeResult.results?.length) {
        geocodeResult = await geocodeOnce({
          address: `${query}, Spain`,
          region: "es",
        });
      }

      if (geocodeResult.status !== "OK" || !geocodeResult.results?.length) {
        geocodeResult = await geocodeOnce({ address: query });
      }

      if (geocodeResult.status !== "OK" || !geocodeResult.results?.length) {
        // Browser-side Google geocode REST can fail due CORS or key restrictions.
        // Fallback to Nominatim so city/address search still works.
        geocodeResult = await geocodeViaNominatim(query);
      }

      if (geocodeResult.status !== "OK" || !geocodeResult.results?.length) {
        if (geocodeResult.status === "ZERO_RESULTS") {
          toast({ title: t.searchNoResult, variant: "destructive" });
        } else {
          toast({ title: t.searchError, variant: "destructive" });
        }
        return;
      }

      const first = geocodeResult.results[0];
      const coords = getLatLonFromGeocodeResult(first);
      if (!coords) {
        toast({ title: t.searchError, variant: "destructive" });
        return;
      }
      const { lat, lon } = coords;

      const inSpain = isSpainGeocodeResult(first);
      if (inSpain === false) {
        toast({ title: t.outsideSpainWarning });
      }

      const queryLooksLikeAddress = isAddressLikeQuery(query);
      if (queryLooksLikeAddress) {
        const currentCenter = gm.getCenter?.();
        const centerLat = currentCenter?.lat?.();
        const centerLng = currentCenter?.lng?.();
        if (typeof centerLat === "number" && typeof centerLng === "number") {
          const centerReverse = await new Promise<{ results: GoogleGeocoderResult[]; status: string }>(
            (resolve) => {
              geocoder.geocode(
                { location: { lat: centerLat, lng: centerLng } },
                (results: GoogleGeocoderResult[] = [], status: string) => resolve({ results, status })
              );
            }
          );
          if (centerReverse.status === "OK" && centerReverse.results?.length) {
            const currentCity = extractCityFromGeocodeResult(centerReverse.results[0]);
            const searchedCity = extractCityFromGeocodeResult(first);
            if (
              currentCity &&
              searchedCity &&
              currentCity.localeCompare(searchedCity, undefined, { sensitivity: "base" }) !== 0
            ) {
              toast({ title: t.addressOtherCity, variant: "destructive" });
              return;
            }
          }
        }
      }

      const looksLikeAddressQuery = isAddressLikeQuery(query);
      const isCityResult = isCityLikeResult(first);

      const normalizedViewport = normalizeViewportForFitBounds(first.geometry?.viewport);
      if (!looksLikeAddressQuery && isCityResult && normalizedViewport && gm.fitBounds) {
        gm.fitBounds(normalizedViewport as any);
        const currentZoom = gm.getZoom?.();
        if (typeof currentZoom === "number" && currentZoom > 12 && gm.setZoom) {
          gm.setZoom(12);
        }
      } else {
        gm.setCenter({ lat, lng: lon });
        gm.setZoom(looksLikeAddressQuery ? MAP_STREET_ZOOM : 14);
      }
    } catch {
      toast({ title: t.searchError, variant: "destructive" });
    } finally {
      setSearchBusy(false);
    }
  }, [
    searchQuery,
    t.searchEmpty,
    t.mapInitFailed,
    t.searchNoResult,
    t.searchError,
    t.addressOtherCity,
    t.outsideSpainWarning,
    toast,
  ]);

  return (
    <div data-vesta-map-root className="relative h-[calc(100vh-3rem)] w-full overflow-hidden">
      <style>{`
        [data-vesta-map-root] .gm-style-mtc,
        [data-vesta-map-root] .gm-svpc,
        [data-vesta-map-root] .gm-style button[title="Map"],
        [data-vesta-map-root] .gm-style button[title="Satellite"] {
          display: none !important;
        }
      `}</style>
      {/* Google Maps only */}
      <div
        ref={googleMapContainerRef}
        className="absolute inset-0 z-[5] h-full w-full"
        data-testid="google-map-container"
      />
      {mapInitError && (
        <div className="absolute inset-0 z-[6] flex items-center justify-center bg-sidebar/80 px-4">
          <div className="max-w-md rounded-xl border border-sidebar-border bg-sidebar p-5 text-center text-sidebar-foreground">
            <p className="text-sm font-semibold">{t.mapUnavailable}</p>
            <p className="mt-2 text-sm text-sidebar-foreground/70">{mapInitError}</p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => {
                setMapInitError(null);
                setMapReloadToken((v) => v + 1);
              }}
            >
              {t.mapRetry}
            </Button>
          </div>
        </div>
      )}

      {/* Top bar — search + Street View + language */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        <form
          className="flex items-center gap-2 rounded-full bg-sidebar border border-sidebar-border px-2 py-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-[270px] bg-transparent px-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/50"
            aria-label={t.searchPlaceholder}
          />
          <Button
            type="submit"
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            disabled={searchBusy}
          >
            {searchBusy ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t.searchingLocation}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Search className="h-3 w-3" />
                {t.searchButton}
              </span>
            )}
          </Button>
        </form>

        <select
          value={uiLocale}
          onChange={(e: any) => setUiLocale(e.target.value as UiLocale)}
          className="rounded-full bg-sidebar border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground"
          aria-label="Language selector"
        >
          <option value="en">EN</option>
          <option value="es">ES</option>
        </select>

        <div className="inline-flex items-center gap-1 rounded-full bg-sidebar border border-sidebar-border p-1">
          <button
            type="button"
            onClick={() => openStreetView()}
            disabled={!selectedCoords}
            title={selectedCoords ? t.streetViewButton : t.streetViewSelectPointFirst}
            aria-label={selectedCoords ? t.streetViewButton : t.streetViewSelectPointFirst}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors enabled:bg-sidebar-primary enabled:text-sidebar-primary-foreground enabled:hover:bg-sidebar-primary/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-sidebar-accent disabled:text-sidebar-foreground/55"
          >
            <ScanLine className="h-3.5 w-3.5 shrink-0" />
            {t.streetViewButton}
          </button>
        </div>
      </div>

      {/* Side panel */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            key="panel"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 bottom-0 z-20 w-full max-w-[380px] flex flex-col"
          >
            <Card className="h-full rounded-none border-l border-y-0 border-r-0 border-sidebar-border/70 bg-sidebar text-sidebar-foreground overflow-hidden flex flex-col">
              <CardHeader className="shrink-0 space-y-0 border-b border-sidebar-border/50 bg-sidebar-accent/20 px-4 pb-4 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 shadow-sm backdrop-blur-sm">
                      <img
                        src={PROPERTY_ANALYSIS_LOGO_SRC}
                        alt="Vesta AI"
                        className="h-8 w-8 object-contain"
                        decoding="async"
                      />
                    </div>
                    <div className="min-w-0 flex-1 pr-1 pt-0.5">
                      <CardTitle className="text-balance text-sidebar-foreground text-[1.05rem] font-semibold leading-snug tracking-tight sm:text-[1.125rem]">
                        {t.propertyAnalysis}
                      </CardTitle>
                      {selectedCoords && (
                        <p className="mt-2 font-mono text-[11px] leading-relaxed text-sidebar-foreground/45">
                          {selectedCoords.lat.toFixed(5)}, {selectedCoords.lon.toFixed(5)}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={closePanel}
                    className="h-8 w-8 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    aria-label="Close panel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="text-sidebar-foreground flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* Identifying */}
                {isIdentifying && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 text-sidebar-primary animate-spin" />
                      <span className="text-sm text-sidebar-foreground/80">{t.queryingCatastro}</span>
                    </div>
                    {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4 w-full bg-sidebar-accent" />)}
                  </div>
                )}

                {/* Error */}
                {identifyError && !isIdentifying && (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <AlertCircle className="h-9 w-9 text-sidebar-foreground/50" />
                    <div>
                      <p className="text-sm font-medium text-sidebar-foreground">{t.noBuildingTitle}</p>
                      <p className="text-sm text-sidebar-foreground/75 mt-1 max-w-[240px] leading-relaxed">
                        {t.noBuildingDesc}
                      </p>
                    </div>
                  </div>
                )}

                {/* Property found */}
                {propertyInfo && !isIdentifying && (
                  <div className="space-y-4">
                    {/* Catastro ref */}
                    {propertyInfo.referenciaCatastral && (
                      <div className="rounded-lg bg-sidebar-primary/10 border border-sidebar-primary/20 px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/80 mb-1">{t.catastroRef}</p>
                        <p className="text-base font-bold text-sidebar-primary font-mono tracking-wide break-all">
                          {propertyInfo.referenciaCatastral}
                        </p>
                      </div>
                    )}

                    {/* Details */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-sidebar-foreground/85 mb-2">{t.propertyData}</p>
                      {propertyInfo.address && <MetricRow label={t.address} value={propertyInfo.address} />}
                      {propertyInfo.municipio && <MetricRow label={t.municipality} value={propertyInfo.municipio} />}
                      {propertyInfo.provincia && <MetricRow label={t.province} value={propertyInfo.provincia} />}
                      {propertyInfo.superficie && <MetricRow label={t.area} value={`${propertyInfo.superficie} m²`} />}
                      {propertyInfo.uso && <MetricRow label={t.usage} value={propertyInfo.uso} />}
                      {propertyInfo.anoConstruccion && <MetricRow label={t.yearBuilt} value={propertyInfo.anoConstruccion} />}
                    </div>

                    <Separator className="bg-sidebar-border" />

                    {/* Financial */}
                    {financialMutation.isPending && !financialData && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 text-sidebar-primary animate-spin" />
                          <span className="text-sm text-sidebar-foreground/80">{t.calculatingYield}</span>
                        </div>
                        {[1,2,3,4].map(i => <Skeleton key={i} className="h-4 w-full bg-sidebar-accent" />)}
                      </div>
                    )}

                    {!financialData && !financialMutation.isPending && financialMutation.isError && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 space-y-2">
                        <p className="text-sm font-medium text-destructive">{t.analysisFailed}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => financialMutation.mutate(propertyInfo)}
                        >
                          <TrendingUp className="mr-2 h-4 w-4" /> {t.retryAnalysis}
                        </Button>
                      </div>
                    )}

                    {!financialData && !financialMutation.isPending && !financialMutation.isError && (
                      <div className="text-center py-2 space-y-3">
                        <p className="text-sm text-sidebar-foreground/80">{t.aiFinancial}</p>
                        <Button className="w-full" onClick={() => {
                            setPaymentModalTier("analysis_pack");
                            setPaymentModalOpen(true);
                          }}>
                          {t.financialAnalysis} — {PRET_ANALYSIS_PACK_EUR} €
                        </Button>
                      </div>
                    )}

                    {financialData && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-sidebar-foreground/85">{t.financialSection}</p>
                        {financialData.grossYield != null && Number.isFinite(parseFloat(String(financialData.grossYield))) && (
                          <MetricRow label={t.grossYield} value={`${parseFloat(String(financialData.grossYield)).toFixed(2)}%`} highlight />
                        )}
                        {financialData.netYield != null && Number.isFinite(parseFloat(String(financialData.netYield))) && (
                          <MetricRow label={t.netYield} value={`${parseFloat(String(financialData.netYield)).toFixed(2)}%`} highlight />
                        )}
                        {financialData.roi != null && Number.isFinite(parseFloat(String(financialData.roi))) && (
                          <MetricRow label={t.roi5y} value={`${parseFloat(String(financialData.roi)).toFixed(2)}%`} highlight />
                        )}
                        {financialData.pricePerSqm != null && Number.isFinite(parseFloat(String(financialData.pricePerSqm))) && (
                          <MetricRow label={t.pricePerSqm} value={`€${parseFloat(String(financialData.pricePerSqm)).toLocaleString()}`} />
                        )}
                        {financialData.estimatedValue != null && Number.isFinite(parseFloat(String(financialData.estimatedValue))) && (
                          <MetricRow label={t.estimatedValue} value={`€${parseFloat(String(financialData.estimatedValue)).toLocaleString()}`} />
                        )}
                        {financialData.monthlyRent != null && Number.isFinite(parseFloat(String(financialData.monthlyRent))) && (
                          <MetricRow label={t.monthlyRent} value={`€${parseFloat(String(financialData.monthlyRent)).toLocaleString()}`} />
                        )}
                        {financialData.annualRentEstimate != null && Number.isFinite(parseFloat(String(financialData.annualRentEstimate))) && (
                          <MetricRow label={t.annualRent} value={`€${parseFloat(String(financialData.annualRentEstimate)).toLocaleString()}`} />
                        )}
                        {financialData.marketAvgSqm != null && Number.isFinite(parseFloat(String(financialData.marketAvgSqm))) && (
                          <MetricRow label={t.zoneAvgPerSqm} value={`€${parseFloat(String(financialData.marketAvgSqm)).toLocaleString()}`} />
                        )}
                        {financialData.avgRentPerSqm != null && Number.isFinite(parseFloat(String(financialData.avgRentPerSqm))) && (
                          <MetricRow label={t.zoneRentPerSqm} value={`€${parseFloat(String(financialData.avgRentPerSqm)).toFixed(2)}`} />
                        )}
                        {financialData.yieldVsBenchmark != null && Number.isFinite(parseFloat(String(financialData.yieldVsBenchmark))) && (
                          <MetricRow label={t.yieldVsSpain} value={`${parseFloat(String(financialData.yieldVsBenchmark)) >= 0 ? "+" : ""}${parseFloat(String(financialData.yieldVsBenchmark)).toFixed(2)} pp`} />
                        )}
                        {financialData.annualCagrPct != null && Number.isFinite(parseFloat(String(financialData.annualCagrPct))) && (
                          <MetricRow label={t.marketCagr} value={`${parseFloat(String(financialData.annualCagrPct)).toFixed(2)}%`} />
                        )}
                        {financialData.capitalAppreciation5yPct != null && Number.isFinite(parseFloat(String(financialData.capitalAppreciation5yPct))) && (
                          <MetricRow label={t.capApp5y} value={`${parseFloat(String(financialData.capitalAppreciation5yPct)).toFixed(2)}%`} />
                        )}
                        {financialData.ineCapitalAppreciationPct != null && Number.isFinite(parseFloat(String(financialData.ineCapitalAppreciationPct))) && (
                          <MetricRow label={t.ineCapApp} value={`${parseFloat(String(financialData.ineCapitalAppreciationPct)).toFixed(2)}%`} />
                        )}
                        {financialData.valuationStatus && (
                          <MetricRow label={t.valuationVsMarket} value={financialData.valuationStatus} />
                        )}
                        {financialData.valuationDiffPct != null && financialData.valuationDiffPct !== undefined && Number.isFinite(Number(financialData.valuationDiffPct)) && (
                          <MetricRow label={t.vsMarketPct} value={`${Number(financialData.valuationDiffPct) >= 0 ? "+" : ""}${Number(financialData.valuationDiffPct).toFixed(1)}%`} />
                        )}
                        {financialData.ineDataPoints != null && (
                          <MetricRow label={t.ineTrendPoints} value={String(financialData.ineDataPoints)} />
                        )}
                        {financialData.dataSource && (
                          <MetricRow label={t.dataSource} value={financialData.dataSource} />
                        )}
                        {financialData.negotiationNote ? (
                          <div className="rounded-md border bg-sidebar-accent border-sidebar-border px-3 py-3 mt-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-sidebar-foreground/85 mb-2">{t.negotiationNote}</p>
                            <p className="text-sm text-sidebar-foreground leading-relaxed">{financialData.negotiationNote}</p>
                          </div>
                        ) : null}
                        {financialData.opportunityScore != null && (
                          <div className="flex justify-center pt-1">
                            <ScoreBadge score={financialData.opportunityScore} />
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-sm font-medium text-foreground/80 hover:text-foreground"
                          onClick={() => financialMutation.mutate(propertyInfo)}
                          disabled={financialMutation.isPending}
                        >
                          {financialMutation.isPending ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                              {t.calculatingYield}
                            </span>
                          ) : (
                            t.financialAnalysis
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Actions */}
                    <Separator className="bg-sidebar-border" />
                    <div className="space-y-2 pb-2">
                      <Button variant="secondary" className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bookmark className="mr-2 h-4 w-4" />}
                        {t.saveProperty}
                      </Button>
                      <Button
                        className="w-full font-semibold"
                        onClick={() => {
                          setPaymentModalTier("expert_report");
                          setPaymentModalOpen(true);
                        }}
                        data-testid="order-full-report"
                      >
                        {t.expertAnalysisOrder} — {PRET_EXPERT_EUR} €
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <StreetViewModal
        open={streetViewOpen}
        lat={streetViewLat}
        lng={streetViewLng}
        locale={uiLocale}
        onClose={() => setStreetViewOpen(false)}
      />

      {/* Payment Modal */}
      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onSuccess={(rid) => {
          setPaymentModalOpen(false);
          navigate(`/reports/${rid}`);
        }}
        propertyInfo={propertyInfo}
        financialData={financialData}
        selectedCoords={selectedCoords}
        fallbackCoords={fallbackCoordsFromMapCenter}
        uiLocale={uiLocale}
        initialTier={paymentModalTier}
      />

    </div>
  );
}