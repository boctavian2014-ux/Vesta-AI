import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { detectBrowserLocale } from "@/lib/locale";
import { useHashLocation } from "wouter/use-hash-location";
import { StreetViewModal } from "@/components/StreetViewModal";
import { PropertyBottomCard } from "@/components/PropertyBottomCard";
import { identifyProperty, checkStreetViewAvailability } from "@/lib/propertyApi";
import { getGoogleMapsBrowserKey, loadGoogleMapsJs } from "@/lib/googleMapsLoader";
import type { PropertyPin, StreetViewMetadataResult } from "@/types/property";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, TrendingUp, Bookmark, FileText, X, Loader2,
  AlertCircle, CheckCircle2, Building2,
  CreditCard, Eye,
} from "lucide-react";

/** Aliniat cu PRET_NOTA_SIMPLE_EUR / PRET_RAPORT_EXPERT_EUR pe API Python (Railway). */
const PRET_NOTA_SIMPLE_EUR =
  Number(import.meta.env.VITE_PRET_NOTA_SIMPLE_EUR) || 19;
const PRET_EXPERT_EUR =
  Number(import.meta.env.VITE_PRET_RAPORT_EXPERT_EUR) ||
  Number(import.meta.env.VITE_PRET_EXPERT_EUR) ||
  49;
const MAP_UI_LOCALE_KEY = "vesta_map_ui_locale";
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

// ── helpers ────────────────────────────────────────────────────────────────

function MetricRow({ label, value, highlight }: { label: string; value?: string | number | null; highlight?: boolean }) {
  const v = value !== undefined && value !== null && value !== "" ? String(value) : "—";
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="map-neon-muted min-w-0 flex-1 text-sm font-medium leading-snug">{label}</span>
      <span
        className={`map-neon-text max-w-[58%] shrink-0 text-right text-sm font-bold tabular-nums leading-snug break-words ${
          highlight ? "text-[#7CFF32]" : ""
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

type ProductTier = "nota_simple" | "expert_report";

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    try {
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
      <PaymentElement />
      <Button type="submit" className="w-full gap-2" disabled={!stripe || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}

function PaymentModal({
  open, onClose, onSuccess, propertyInfo, financialData, selectedCoords, uiLocale,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (reportId: number) => void;
  propertyInfo: PropertyInfo | null;
  financialData: FinancialAnalysis | null;
  selectedCoords: { lat: number; lon: number } | null;
  uiLocale: UiLocale;
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
        bulletsNota1: "Nota Simple oficial solicitada a colaboradores autorizados (Registro)",
        bulletsNota2: "Titular, cargas, hipotecas — documento en formato PDF",
        bulletsNota3: "Notificacion cuando el documento este disponible",
        bulletsExpert1: "Todo lo incluido en el paquete Nota Simple (oficial)",
        bulletsExpert2: "Informe experto AI: analisis financiero, riesgos, resumen para inversor",
        bulletsExpert3: "Due diligence ampliada con base catastral y de mercado",
        orderDocs: "Solicitar documentos e informe",
        twoPacks: "Dos paquetes: Nota Simple oficial o informe experto completo con analisis AI.",
        catastroRef: "Referencia Catastro",
        choosePack: "Elige paquete",
        notaTitle: "Nota Simple oficial",
        notaSub: "De colaboradores autorizados del registro espanol",
        expertTitle: "Informe experto completo",
        expertSub: "Nota Simple + analisis AI y due diligence",
        include: "Que incluye",
        total: "Total",
        paymentInit: "Inicializando pago...",
        registeringOrder: "Registrando pedido",
        generatingReport: "Generando informe",
        sendingRequest: "Enviamos la solicitud a colaboradores oficiales para Nota Simple",
        waitingAI: "Despues del pago: Nota Simple de colaboradores y luego analisis AI; puede tardar unos minutos",
        elapsed: "transcurridos",
        orderRegistered: "Pedido registrado",
        reportProgress: "Informe en curso / generado",
        notaDelivered: "La Nota Simple oficial se entregara por el flujo de colaboradores. Revisa en Informes.",
        redirecting: "Redirigiendo al detalle del informe...",
        cancel: "Cancelar",
        payNow: "Pagar",
        missingStripePk: "Falta VITE_STRIPE_PUBLISHABLE_KEY en el build. Anade la clave publica de Stripe.",
        securePay: "Pagar con tarjeta",
        backToPacks: "Volver a paquetes",
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
        bulletsNota1: "Official Nota Simple requested from authorized partners (Registro)",
        bulletsNota2: "Owner, liens, mortgages — PDF document",
        bulletsNota3: "Notification when the document is available",
        bulletsExpert1: "Everything included in the official Nota Simple package",
        bulletsExpert2: "AI expert report: financial analysis, risks, investor summary",
        bulletsExpert3: "Extended due diligence based on cadastral and market data",
        orderDocs: "Order documents & report",
        twoPacks: "Two packages: official Nota Simple or full expert report with AI analysis.",
        catastroRef: "Catastro reference",
        choosePack: "Choose package",
        notaTitle: "Official Nota Simple",
        notaSub: "From authorized Spanish registry collaborators",
        expertTitle: "Full expert report",
        expertSub: "Nota Simple + AI analysis and due diligence",
        include: "Includes",
        total: "Total",
        paymentInit: "Initializing payment...",
        registeringOrder: "Registering order",
        generatingReport: "Generating report",
        sendingRequest: "Sending request to official collaborators for Nota Simple",
        waitingAI: "After payment: Nota Simple from collaborators, then AI analysis — this may take a few minutes",
        elapsed: "elapsed",
        orderRegistered: "Order registered",
        reportProgress: "Report in progress / generated",
        notaDelivered: "The official Nota Simple will be delivered via collaborators flow. Track it in Reports.",
        redirecting: "Redirecting to report details...",
        cancel: "Cancel",
        payNow: "Pay",
        missingStripePk: "Missing VITE_STRIPE_PUBLISHABLE_KEY in the build. Add your Stripe publishable key.",
        securePay: "Pay securely",
        backToPacks: "Back to packages",
      };

  const { toast } = useToast();
  const [step, setStep] = useState<"confirm" | "paying" | "payment" | "processing" | "done">("confirm");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [tier, setTier] = useState<ProductTier>("nota_simple");
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qc = useQueryClient();

  const priceForTier = tier === "expert_report" ? PRET_EXPERT_EUR : PRET_NOTA_SIMPLE_EUR;

  // Reset when opened; clear poll timer when modal closes
  useEffect(() => {
    if (open) {
      setStep("confirm");
      setClientSecret(null);
      setPaymentIntentId(null);
      setPollCount(0);
      setTier("nota_simple");
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, [open]);

  // Step 1: create payment intent
  const startPayment = async () => {
    if (!propertyInfo) return;
    if (!selectedCoords) {
      toast({ title: tr.missingCoords, description: tr.reselect, variant: "destructive" });
      return;
    }
    setStep("paying");
    try {
      const payload: Record<string, unknown> = {
        email: "",
        property_id: 0,
        tip: tier,
        referencia_catastral: propertyInfo.referenciaCatastral ?? "",
        address: propertyInfo.address ?? "",
        lat: selectedCoords.lat,
        lon: selectedCoords.lon,
      };
      if (tier === "expert_report") {
        payload.context_json = JSON.stringify({
          cadastral_json: propertyInfo ?? {},
          financial_data: financialData ?? {},
          market_data: {},
          output_language: uiLocale,
        });
      }
      const res = await apiRequest("POST", "/api/payment/create", payload);
      const data = await res.json();
      if (!data.clientSecret) throw new Error("No client secret");
      const pi =
        typeof data.paymentIntentId === "string" ? data.paymentIntentId : undefined;
      if (!pi) throw new Error(tr.missingPaymentId);
      if (!stripePromise) {
        toast({ title: tr.payError, description: tr.missingStripePk, variant: "destructive" });
        setStep("confirm");
        return;
      }
      setClientSecret(data.clientSecret);
      setPaymentIntentId(pi);
      setStep("payment");
    } catch (err: any) {
      toast({ title: tr.payError, description: err.message, variant: "destructive" });
      setStep("confirm");
    }
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
        type: productTier === "nota_simple" ? "nota_simple" : "expert_report",
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

  /** Așteaptă webhook Stripe → Nota Simple → job AI (backend Python), nu /report/generate-async gol. */
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

  const notaBullets = [
    tr.bulletsNota1,
    tr.bulletsNota2,
    tr.bulletsNota3,
  ];
  const expertBullets = [
    tr.bulletsExpert1,
    tr.bulletsExpert2,
    tr.bulletsExpert3,
  ];

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
            <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 space-y-1">
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
                  onClick={() => setTier("nota_simple")}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    tier === "nota_simple"
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{tr.notaTitle}</span>
                    <span className="text-sm font-bold text-primary">{PRET_NOTA_SIMPLE_EUR} €</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{tr.notaSub}</p>
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
                {(tier === "nota_simple" ? notaBullets : expertBullets).map((item) => (
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
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">
                  {tier === "nota_simple" ? tr.registeringOrder : tr.generatingReport}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tier === "nota_simple"
                    ? tr.sendingRequest
                    : tr.waitingAI}
                </p>
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
                {tier === "nota_simple" ? tr.orderRegistered : tr.reportProgress}
              </p>
              <p className="text-xs text-muted-foreground">
                {tier === "nota_simple"
                  ? tr.notaDelivered
                  : tr.redirecting}
              </p>
            </div>
          )}
        </div>

        {step === "confirm" && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">{tr.cancel}</Button>
            <Button onClick={startPayment} className="flex-1 gap-2">
              <CreditCard className="h-4 w-4" />
              {tr.payNow} {priceForTier} €
            </Button>
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

  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [propertyInfo, setPropertyInfo] = useState<PropertyInfo | null>(null);
  const [financialData, setFinancialData] = useState<FinancialAnalysis | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [streetViewOpen, setStreetViewOpen] = useState(false);
  const [checkingStreetView, setCheckingStreetView] = useState(false);
  const [streetViewMeta, setStreetViewMeta] = useState<StreetViewMetadataResult | null>(null);
  const [bottomPropertyCardDismissed, setBottomPropertyCardDismissed] = useState(false);
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

  const t = uiLocale === "es"
    ? {
        streetView: "Street View",
        clickBuilding: "Haz clic en un edificio",
        propertyAnalysis: "Analisis de propiedad",
        queryingCatastro: "Consultando Catastro...",
        noBuildingTitle: "No se encontro edificio",
        noBuildingDesc: "Haz clic directamente sobre el tejado de un edificio. Haz zoom para mayor precision.",
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
        orderReport: "Pedir — Nota Simple o informe experto",
        streetViewUnavailable: "Street View no disponible",
        missingStreetKey: "Falta VITE_GOOGLE_MAPS_JS_API_KEY.",
        status: "Estado",
        noBuildingError: "No se encontro edificio. Haz clic directamente en un edificio.",
        analysisFailed: "Analisis fallido",
        retryAnalysis: "Reintentar analisis",
        propertySaved: "Propiedad guardada",
        genericError: "Error",
        selectedProperty: "Inmueble seleccionado",
      }
    : {
        streetView: "Street View",
        clickBuilding: "Click a building",
        propertyAnalysis: "Property analysis",
        queryingCatastro: "Querying Catastro...",
        noBuildingTitle: "No building found",
        noBuildingDesc: "Click directly on a building roof. Zoom in for better precision.",
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
        orderReport: "Order — Nota Simple or expert report",
        streetViewUnavailable: "Street View unavailable",
        missingStreetKey: "Missing VITE_GOOGLE_MAPS_JS_API_KEY.",
        status: "Status",
        noBuildingError: "No building found. Click directly on a building.",
        analysisFailed: "Analysis failed",
        retryAnalysis: "Retry analysis",
        propertySaved: "Property saved",
        genericError: "Error",
        selectedProperty: "Selected property",
      };

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
      financialMutation.mutate(data);
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
      setStreetViewOpen(false);
      setStreetViewMeta(null);
      setCheckingStreetView(false);
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

  // ── Google Maps only (roadmap + Street View) ────────────────────────────

  useLayoutEffect(() => {
    const key = getGoogleMapsBrowserKey();
    const container = googleMapContainerRef.current;
    if (!key || !container) return;

    let cancelled = false;
    loadGoogleMapsJs(key).then(() => {
      if (cancelled || !googleMapContainerRef.current) return;
      const g = (window as any).google?.maps;
      if (!g?.Map) return;

      if (!googleMapRef.current) {
        googleMapRef.current = new g.Map(googleMapContainerRef.current, {
          center: { lat: 40.4168, lng: -3.7038 },
          zoom: 17,
          mapTypeId: g.MapTypeId.ROADMAP,
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
        });
        googleMapRef.current.addListener("click", (e: any) => {
          if (e.latLng) beginPropertySelectionRef.current(e.latLng.lat(), e.latLng.lng());
        });
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
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPropertyInfo(null);
    setFinancialData(null);
    setSelectedCoords(null);
    setIdentifyError(null);
    setStreetViewOpen(false);
    setStreetViewMeta(null);
    setCheckingStreetView(false);
    setBottomPropertyCardDismissed(false);
    if (googleMarkerRef.current) {
      googleMarkerRef.current.setMap(null);
      googleMarkerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setBottomPropertyCardDismissed(false);
  }, [selectedCoords?.lat, selectedCoords?.lon]);

  const selectedProperty = useMemo<PropertyPin | null>(() => {
    if (!selectedCoords) return null;
    const ref = propertyInfo?.referenciaCatastral || `${selectedCoords.lat},${selectedCoords.lon}`;
    const title =
      propertyInfo?.address ||
      (propertyInfo?.referenciaCatastral
        ? `${t.selectedProperty} ${propertyInfo.referenciaCatastral}`
        : t.selectedProperty);
    const scoreRaw = financialData?.opportunityScore ?? propertyInfo?.oportunityScore;
    const scoreNum = scoreRaw != null ? Number(scoreRaw) : undefined;
    return {
      id: String(ref),
      title,
      lat: selectedCoords.lat,
      lng: selectedCoords.lon,
      address: propertyInfo?.address,
      opportunityScore: Number.isFinite(scoreNum as number) ? scoreNum : undefined,
    };
  }, [selectedCoords, propertyInfo, financialData]);

  const isIdentifying = identifyMutation.isPending;
  const streetViewAvailable = !checkingStreetView && streetViewMeta?.status === "OK";

  useEffect(() => {
    if (!selectedProperty) {
      setStreetViewMeta(null);
      setCheckingStreetView(false);
      return;
    }
    let cancelled = false;
    setCheckingStreetView(true);
    checkStreetViewAvailability(selectedProperty.lat, selectedProperty.lng, {
      source: "outdoor",
      radius: 25,
    })
      .then((meta) => {
        if (!cancelled) setStreetViewMeta(meta);
      })
      .finally(() => {
        if (!cancelled) setCheckingStreetView(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProperty]);

  const openStreetView = useCallback(() => {
    if (!selectedProperty) return;
    if (checkingStreetView) return;
    if (!streetViewAvailable) {
      toast({
        title: t.streetViewUnavailable,
        description: streetViewMeta?.status === "MISSING_API_KEY"
          ? t.missingStreetKey
          : `${t.status}: ${streetViewMeta?.status ?? "UNKNOWN"}`,
        variant: "destructive",
      });
      return;
    }
    setStreetViewOpen(true);
  }, [selectedProperty, checkingStreetView, streetViewAvailable, streetViewMeta, toast, t.missingStreetKey, t.status, t.streetViewUnavailable]);

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full overflow-hidden">
      {/* Google Maps only */}
      <div
        ref={googleMapContainerRef}
        className="absolute inset-0 z-[5] h-full w-full"
        data-testid="google-map-container"
      />

      {/* Top bar — Street View + language */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        {/* Google Street View button */}
        <button
          type="button"
          title={t.streetView}
          onClick={openStreetView}
          disabled={!selectedProperty || !streetViewAvailable}
          className="flex items-center gap-1.5 bg-black/75 backdrop-blur-sm border border-white/10 rounded-full px-3 py-2 text-xs text-white hover:bg-black/90 transition-colors shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Eye className="h-3.5 w-3.5" /> {t.streetView}
        </button>

        <select
          value={uiLocale}
          onChange={(e: any) => setUiLocale(e.target.value as UiLocale)}
          className="rounded-full border border-white/20 bg-black/70 px-3 py-2 text-xs text-white"
          aria-label="Language selector"
        >
          <option value="en">EN</option>
          <option value="es">ES</option>
        </select>

        {!panelOpen && (
          <div className="hidden md:flex items-center gap-1.5 bg-black/60 backdrop-blur-sm border border-white/10 rounded-full px-3 py-2 text-xs text-white/80">
            <MapPin className="h-3 w-3 text-primary" />
            {t.clickBuilding}
          </div>
        )}
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
            <Card className="h-full rounded-none border-l border-y-0 border-r-0 border-border bg-card/97 backdrop-blur-sm shadow-2xl overflow-hidden flex flex-col">
              <CardHeader className="map-neon-text pb-3 pt-4 px-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-8 w-8 shrink-0 text-primary" />
                    <CardTitle className="map-neon-text text-[2rem] font-extrabold leading-tight tracking-tight">
                      {t.propertyAnalysis}
                    </CardTitle>
                  </div>
                  <Button variant="ghost" size="icon" onClick={closePanel} className="h-7 w-7">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {selectedCoords && (
                  <p className="map-neon-muted text-xs font-mono mt-1.5">
                    {selectedCoords.lat.toFixed(5)}, {selectedCoords.lon.toFixed(5)}
                  </p>
                )}
              </CardHeader>
              <Separator />

              <CardContent className="map-neon-text flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* Identifying */}
                {isIdentifying && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                      <span className="text-sm text-foreground/80">{t.queryingCatastro}</span>
                    </div>
                    {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4 w-full" />)}
                  </div>
                )}

                {/* Error */}
                {identifyError && !isIdentifying && (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <AlertCircle className="h-9 w-9 text-muted-foreground/50" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.noBuildingTitle}</p>
                      <p className="text-sm text-foreground/75 mt-1 max-w-[240px] leading-relaxed">
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
                      <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80 mb-1">{t.catastroRef}</p>
                        <p className="text-base font-bold text-primary font-mono tracking-wide break-all">
                          {propertyInfo.referenciaCatastral}
                        </p>
                      </div>
                    )}

                    {/* Details */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-foreground/85 mb-2">{t.propertyData}</p>
                      {propertyInfo.address && <MetricRow label={t.address} value={propertyInfo.address} />}
                      {propertyInfo.municipio && <MetricRow label={t.municipality} value={propertyInfo.municipio} />}
                      {propertyInfo.provincia && <MetricRow label={t.province} value={propertyInfo.provincia} />}
                      {propertyInfo.superficie && <MetricRow label={t.area} value={`${propertyInfo.superficie} m²`} />}
                      {propertyInfo.uso && <MetricRow label={t.usage} value={propertyInfo.uso} />}
                      {propertyInfo.anoConstruccion && <MetricRow label={t.yearBuilt} value={propertyInfo.anoConstruccion} />}
                    </div>

                    <Separator />

                    {/* Financial */}
                    {financialMutation.isPending && !financialData && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 text-primary animate-spin" />
                          <span className="text-sm text-foreground/80">{t.calculatingYield}</span>
                        </div>
                        {[1,2,3,4].map(i => <Skeleton key={i} className="h-4 w-full" />)}
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
                        <TrendingUp className="h-7 w-7 text-primary/50 mx-auto" />
                        <p className="text-sm text-foreground/80">{t.aiFinancial}</p>
                        <Button className="w-full" onClick={() => financialMutation.mutate(propertyInfo)}>
                          <TrendingUp className="mr-2 h-4 w-4" /> {t.financialAnalysis}
                        </Button>
                      </div>
                    )}

                    {financialData && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-foreground/85">{t.financialSection}</p>
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
                          <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-3 mt-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-foreground/85 mb-2">{t.negotiationNote}</p>
                            <p className="text-sm text-foreground leading-relaxed">{financialData.negotiationNote}</p>
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
                    <Separator />
                    <div className="space-y-2 pb-2">
                      {/* Street View — embed intern */}
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={openStreetView}
                        disabled={!streetViewAvailable}
                        data-testid="open-street-view"
                      >
                        <Eye className="h-4 w-4" />
                        {t.streetView} 360°
                      </Button>
                      <Button variant="secondary" className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bookmark className="mr-2 h-4 w-4" />}
                        {t.saveProperty}
                      </Button>
                      <Button
                        className="w-full font-semibold"
                        onClick={() => setPaymentModalOpen(true)}
                        data-testid="order-full-report"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        {t.orderReport}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

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
        uiLocale={uiLocale}
      />

      {/* Bottom property card + Street View modal (over Google map) */}
      {!streetViewOpen && selectedProperty && !bottomPropertyCardDismissed && (
        <PropertyBottomCard
          property={selectedProperty}
          checkingStreetView={checkingStreetView}
          streetViewMeta={streetViewMeta}
          locale={uiLocale}
          onOpenStreetView={openStreetView}
          onClose={closePanel}
          onKeepSatellite={() => setBottomPropertyCardDismissed(true)}
        />
      )}

      <StreetViewModal
        open={streetViewOpen}
        lat={selectedProperty?.lat ?? null}
        lng={selectedProperty?.lng ?? null}
        title={selectedProperty?.title}
        metadata={streetViewMeta}
        locale={uiLocale}
        onClose={() => setStreetViewOpen(false)}
      />
    </div>
  );
}