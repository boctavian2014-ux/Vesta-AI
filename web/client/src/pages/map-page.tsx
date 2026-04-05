import { useEffect, useRef, useState, useCallback } from "react";
const mapboxgl = (window as any).mapboxgl;
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useHashLocation } from "wouter/use-hash-location";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, TrendingUp, Bookmark, FileText, X, Loader2,
  AlertCircle, CheckCircle2, Building2, Satellite, Map,
  ExternalLink, CreditCard, Eye, Maximize2, RotateCcw, RotateCw,
} from "lucide-react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

// Stiluri hartă
const STYLES = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",  // Satelit aerian
  standard:  "mapbox://styles/mapbox/satellite-streets-v12",  // Satelit la nivel sol (același stil, altă cameră)
  dark:      "mapbox://styles/mapbox/dark-v11",               // Dark cu 3D extrusion
};

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
  [key: string]: any;
}

// ── helpers ────────────────────────────────────────────────────────────────

function MetricRow({ label, value, highlight }: { label: string; value?: string | number | null; highlight?: boolean }) {
  const v = value !== undefined && value !== null && value !== "" ? String(value) : "—";
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>{v}</span>
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
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
      Score: {n.toFixed(0)}/100
    </div>
  );
}

// ── Payment Modal ──────────────────────────────────────────────────────────

function PaymentModal({
  open, onClose, onSuccess, propertyInfo, financialData,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (reportId: number) => void;
  propertyInfo: PropertyInfo | null;
  financialData: FinancialAnalysis | null;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<"confirm" | "paying" | "processing" | "done">("confirm");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [reportId, setReportId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const qc = useQueryClient();

  // Reset when opened
  useEffect(() => {
    if (open) { setStep("confirm"); setClientSecret(null); setReportId(null); setJobId(null); setPollCount(0); }
  }, [open]);

  // Step 1: create payment intent
  const startPayment = async () => {
    if (!propertyInfo) return;
    setStep("paying");
    try {
      const res = await apiRequest("POST", "/api/payment/create", {
        email: "", // will be filled server-side from session
        property_id: 0,
        tip: "standard",
      });
      const data = await res.json();
      if (!data.clientSecret) throw new Error("No client secret");
      setClientSecret(data.clientSecret);
      // We use Stripe Elements — but for now we simulate confirm with the secret
      // In production you'd mount CardElement. Here we go straight to processing.
      await confirmAndProcess(data.clientSecret);
    } catch (err: any) {
      toast({ title: "Eroare la plată", description: err.message, variant: "destructive" });
      setStep("confirm");
    }
  };

  const confirmAndProcess = async (secret: string) => {
    setStep("processing");
    try {
      // Create local report record
      const reportRes = await apiRequest("POST", "/api/reports", {
        type: "expert_report",
        status: "processing",
        referenciaCatastral: propertyInfo?.referenciaCatastral ?? "",
        address: propertyInfo?.address ?? "",
        cadastralJson: JSON.stringify(propertyInfo ?? {}),
        financialJson: JSON.stringify(financialData ?? {}),
      });
      const report = await reportRes.json();
      setReportId(report.id);

      // Start async AI report generation
      const genRes = await apiRequest("POST", "/api/report/generate", {
        inputs: {
          cadastral_json: propertyInfo ?? {},
          nota_simple_text: "",
          financial_data: financialData ?? {},
          market_data: {},
        },
        language: "es",
        max_retries: 2,
      });
      const genData = await genRes.json();
      const jid = genData.job_id;

      if (jid) {
        await apiRequest("PATCH", `/api/reports/${report.id}`, { stripeJobId: jid });
        setJobId(jid);
        // poll for completion
        pollStatus(jid, report.id);
      } else {
        await apiRequest("PATCH", `/api/reports/${report.id}`, { status: "completed" });
        setStep("done");
        qc.invalidateQueries({ queryKey: ["/api/reports"] });
        onSuccess(report.id);
      }
    } catch (err: any) {
      toast({ title: "Eroare la generare", description: err.message, variant: "destructive" });
      setStep("confirm");
    }
  };

  const pollStatus = async (jid: string, rid: number) => {
    let attempts = 0;
    const maxAttempts = 40;
    const interval = setInterval(async () => {
      attempts++;
      setPollCount(attempts);
      try {
        const res = await apiRequest("GET", `/api/report/status/${jid}`);
        const data = await res.json();
        if (data.status === "completed" && data.report) {
          clearInterval(interval);
          await apiRequest("PATCH", `/api/reports/${rid}`, {
            status: "completed",
            reportJson: JSON.stringify(data.report),
          });
          qc.invalidateQueries({ queryKey: ["/api/reports"] });
          qc.invalidateQueries({ queryKey: ["/api/reports", rid] });
          setStep("done");
          onSuccess(rid);
        } else if (data.status === "failed" || attempts >= maxAttempts) {
          clearInterval(interval);
          await apiRequest("PATCH", `/api/reports/${rid}`, { status: "failed" });
          toast({ title: "Raport eșuat", description: "Încearcă din nou.", variant: "destructive" });
          onClose();
        }
      } catch {}
    }, 4000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && step === "confirm" && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Raport Complet Proprietate
          </DialogTitle>
          <DialogDescription>
            Analiză completă: Nota Simplă, date proprietar, situație juridică și financiară
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Property summary */}
          {propertyInfo?.referenciaCatastral && (
            <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Referință Catastro</p>
              <p className="text-sm font-bold text-primary font-mono">{propertyInfo.referenciaCatastral}</p>
              {propertyInfo.address && <p className="text-xs text-muted-foreground">{propertyInfo.address}</p>}
            </div>
          )}

          {/* What you get */}
          {step === "confirm" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ce include raportul</p>
              {[
                "Nota Simplă — proprietar, ipoteci, sarcini",
                "Situație juridică completă din Registro",
                "Analiza financiară AI (randament, ROI, valoare)",
                "Riscuri urbanistice și discrepanțe",
                "Rezumat executiv pentru investitori",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs text-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  {item}
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-sm text-muted-foreground">Preț</span>
                <span className="text-lg font-bold text-foreground">19 €</span>
              </div>
            </div>
          )}

          {/* Paying state */}
          {step === "paying" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Inițializare plată…</p>
            </div>
          )}

          {/* Processing state */}
          {step === "processing" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Se generează raportul</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cerere Nota Simplă · Analiză AI · Situație financiară
                </p>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(95, (pollCount / 40) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{pollCount * 4}s elapsed…</p>
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              <p className="text-sm font-semibold text-foreground">Raport generat cu succes!</p>
              <p className="text-xs text-muted-foreground">Redirecționare automată…</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {step === "confirm" && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Anulează</Button>
            <Button onClick={startPayment} className="flex-1 gap-2">
              <CreditCard className="h-4 w-4" />
              Plătește 19 €
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Map Page ──────────────────────────────────────────────────────────

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useHashLocation();

  type MapMode = "satellite" | "standard" | "dark";
  const [mapMode, setMapMode] = useState<MapMode>("satellite");
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [propertyInfo, setPropertyInfo] = useState<PropertyInfo | null>(null);
  const [financialData, setFinancialData] = useState<FinancialAnalysis | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // ── mutations ──────────────────────────────────────────────────────────

  const identifyMutation = useMutation({
    mutationFn: async ({ lat, lon }: { lat: number; lon: number }) => {
      const res = await apiRequest("POST", "/api/property/identify", { lat, lon });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Not found");
      }
      return res.json();
    },
    onSuccess: (data) => { setPropertyInfo(data); setIdentifyError(null); },
    onError: () => {
      setIdentifyError("Nicio clădire găsită. Fă click direct pe o clădire.");
      setPropertyInfo(null);
    },
  });

  const financialMutation = useMutation({
    mutationFn: async (payload: PropertyInfo) => {
      const res = await apiRequest("POST", "/api/property/financial-analysis", payload);
      return res.json();
    },
    onSuccess: (data) => setFinancialData(data),
    onError: (err: any) => toast({ title: "Analiză eșuată", description: err.message, variant: "destructive" }),
  });

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
      toast({ title: "Proprietate salvată" });
    },
    onError: (err: any) => toast({ title: "Eroare", description: err.message, variant: "destructive" }),
  });

  // ── 3D buildings — DOAR pe modul dark, nu pe satellite sau standard ──────
  // Pe satellite: clădirile reale sunt vizibile din aer
  // Pe standard: Mapbox Standard are propriul sistem 3D cu texturi (nu fill-extrusion)
  // Pe dark: adăugăm fill-extrusion cu înălțime dar fără a acoperi imaginea
  const add3DBuildings = useCallback((mode: "satellite" | "standard" | "dark", mapInstance: any) => {
    if (mode !== "dark") return; // satellite și standard au 3D nativ
    if (!mapInstance.getSource("composite")) return;
    if (mapInstance.getLayer("3d-buildings")) mapInstance.removeLayer("3d-buildings");

    mapInstance.addLayer({
      id: "3d-buildings",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": [
          "interpolate", ["linear"], ["zoom"],
          14, "hsl(220, 12%, 22%)",
          18, "hsl(220, 18%, 32%)",
        ],
        "fill-extrusion-height": [
          "interpolate", ["linear"], ["zoom"],
          14, 0, 14.05, ["get", "height"],
        ],
        "fill-extrusion-base": [
          "interpolate", ["linear"], ["zoom"],
          14, 0, 14.05, ["get", "min_height"],
        ],
        "fill-extrusion-opacity": 0.85,
      },
    });
  }, []);

  // ── init map ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: STYLES.satellite,
      center: [-3.7038, 40.4168],
      zoom: 17,
      pitch: 45,
      bearing: -20,
      antialias: true,
      maxPitch: 85,
    });

    map.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.current.addControl(new mapboxgl.ScaleControl(), "bottom-left");

    map.current.on("style.load", () => {
      add3DBuildings("satellite", map.current);
    });

    map.current.on("click", (e: any) => {
      const { lat, lng: lon } = e.lngLat;

      const el = document.createElement("div");
      el.style.cssText = `width:24px;height:24px;border-radius:50%;background:hsl(38,70%,50%);border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.6);cursor:pointer;`;

      if (marker.current) {
        marker.current.setLngLat([lon, lat]);
      } else {
        marker.current = new mapboxgl.Marker({ element: el })
          .setLngLat([lon, lat])
          .addTo(map.current);
      }

      setSelectedCoords({ lat, lon });
      setPropertyInfo(null);
      setFinancialData(null);
      setIdentifyError(null);
      setPanelOpen(true);

      identifyMutation.mutate({ lat, lon });
    });

    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // ── switch map mode ────────────────────────────────────────────────────

  const switchMode = useCallback((next: "satellite" | "standard" | "dark") => {
    setMapMode(next);
    if (!map.current) return;

    const applyCamera = () => {
      const center = selectedCoords
        ? [selectedCoords.lon, selectedCoords.lat]
        : map.current.getCenter().toArray();

      if (next === "satellite") {
        // Vedere aeriană — pitch mic, zoom mediu
        map.current.easeTo({ pitch: 45, zoom: 17, bearing: -20, duration: 900 });
      } else if (next === "standard") {
        // Nivel sol — pitch maxim (pietonal), zoom foarte mare, satelit culori reale
        map.current.easeTo({ center, pitch: 85, zoom: 20, bearing: map.current.getBearing(), duration: 1200 });
      } else if (next === "dark") {
        map.current.easeTo({ pitch: 50, zoom: 17, duration: 800 });
      }
    };

    // Dacă trecem între satellite ⇔ standard nu schimbăm stilul (același)
    // Dacă trecem la/de la dark, schimbăm stilul
    const currentStyle = map.current.getStyle()?.name ?? "";
    const needsStyleChange =
      (next === "dark" && mapMode !== "dark") ||
      (next !== "dark" && mapMode === "dark");

    if (needsStyleChange) {
      map.current.setStyle(STYLES[next]);
      map.current.once("style.load", () => {
        add3DBuildings(next, map.current);
        if (marker.current && selectedCoords) marker.current.addTo(map.current);
        applyCamera();
      });
    } else {
      // Doar mișcă camera, fără reload stil
      applyCamera();
    }
  }, [mapMode, add3DBuildings, selectedCoords]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPropertyInfo(null);
    setFinancialData(null);
    setSelectedCoords(null);
    setIdentifyError(null);
    if (marker.current) { marker.current.remove(); marker.current = null; }
  }, []);

  // Street View modal
  const [streetViewOpen, setStreetViewOpen] = useState(false);

  // Google Maps embed — street view via cbll param (no API key needed)
  // Format: /maps?q=&layer=c&cbll=lat,lon  
  const streetViewEmbedUrl = selectedCoords
    ? `https://maps.google.com/maps?q=&layer=c&cbll=${selectedCoords.lat},${selectedCoords.lon}&cbp=11,0,0,0,0&output=embed&z=18`
    : null;

  const streetViewUrl = selectedCoords
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selectedCoords.lat},${selectedCoords.lon}`
    : null;

  const isIdentifying = identifyMutation.isPending;

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full overflow-hidden">
      {/* Map */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" data-testid="map-container" />

      {/* Top bar — 3 mode switcher + Street View */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
        {/* Mode switcher pill */}
        <div className="flex items-center bg-black/75 backdrop-blur-sm border border-white/10 rounded-full shadow-xl overflow-hidden">
          {([
            { key: "satellite", label: "Satelit",   icon: <Satellite className="h-3.5 w-3.5" /> },
            { key: "standard",  label: "3D Sol",    icon: <Building2  className="h-3.5 w-3.5" /> },
            { key: "dark",      label: "Hartă",     icon: <Map        className="h-3.5 w-3.5" /> },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => switchMode(key)}
              data-testid={`mode-${key}`}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                mapMode === key
                  ? "bg-primary text-primary-foreground"
                  : "text-white hover:bg-white/10"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Google Street View button — apare mereu dar mai vizibil după click */}
        <a
          href={streetViewUrl ?? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=40.4168,-3.7038`}
          target="_blank"
          rel="noopener noreferrer"
          title="Deschide Google Street View"
          className="flex items-center gap-1.5 bg-black/75 backdrop-blur-sm border border-white/10 rounded-full px-3 py-2 text-xs text-white hover:bg-black/90 transition-colors shadow-xl"
        >
          <Eye className="h-3.5 w-3.5" /> Street View
        </a>

        {/* Rotation controls — only in 3D Sol mode */}
        {mapMode === "standard" && (
          <div className="flex items-center gap-1 bg-black/75 backdrop-blur-sm border border-white/10 rounded-full shadow-xl overflow-hidden">
            <button
              onClick={() => map.current?.easeTo({ bearing: (map.current.getBearing() - 45), duration: 500 })}
              className="flex items-center gap-1 px-3 py-2 text-xs text-white hover:bg-white/10 transition-colors"
              title="Rotire stânga"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <span className="text-white/40 text-xs">|</span>
            <button
              onClick={() => map.current?.easeTo({ bearing: (map.current.getBearing() + 45), duration: 500 })}
              className="flex items-center gap-1 px-3 py-2 text-xs text-white hover:bg-white/10 transition-colors"
              title="Rotire dreapta"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {!panelOpen && mapMode !== "standard" && (
          <div className="hidden md:flex items-center gap-1.5 bg-black/60 backdrop-blur-sm border border-white/10 rounded-full px-3 py-2 text-xs text-white/80">
            <MapPin className="h-3 w-3 text-primary" />
            Click pe clădire
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
              <CardHeader className="pb-3 pt-4 px-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-semibold">Analiză Proprietate</CardTitle>
                  </div>
                  <Button variant="ghost" size="icon" onClick={closePanel} className="h-7 w-7">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {selectedCoords && (
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                    {selectedCoords.lat.toFixed(5)}, {selectedCoords.lon.toFixed(5)}
                  </p>
                )}
              </CardHeader>
              <Separator />

              <CardContent className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* Identifying */}
                {isIdentifying && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                      <span className="text-xs text-muted-foreground">Interogare Catastro…</span>
                    </div>
                    {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-3 w-full" />)}
                  </div>
                )}

                {/* Error */}
                {identifyError && !isIdentifying && (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <AlertCircle className="h-9 w-9 text-muted-foreground/50" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Nicio clădire găsită</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                        Fă click direct pe acoperișul unei clădiri. Zoom in pentru mai multă precizie.
                      </p>
                    </div>
                  </div>
                )}

                {/* Property found */}
                {propertyInfo && !isIdentifying && (
                  <div className="space-y-4">
                    {/* Catastro ref */}
                    {propertyInfo.referenciaCatastral && (
                      <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Referință Catastro</p>
                        <p className="text-sm font-bold text-primary font-mono tracking-wide">
                          {propertyInfo.referenciaCatastral}
                        </p>
                      </div>
                    )}

                    {/* Details */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Date Imobil</p>
                      {propertyInfo.address && <MetricRow label="Adresă" value={propertyInfo.address} />}
                      {propertyInfo.municipio && <MetricRow label="Municipiu" value={propertyInfo.municipio} />}
                      {propertyInfo.provincia && <MetricRow label="Provincie" value={propertyInfo.provincia} />}
                      {propertyInfo.superficie && <MetricRow label="Suprafață" value={`${propertyInfo.superficie} m²`} />}
                      {propertyInfo.uso && <MetricRow label="Utilizare" value={propertyInfo.uso} />}
                      {propertyInfo.anoConstruccion && <MetricRow label="An construcție" value={propertyInfo.anoConstruccion} />}
                    </div>

                    <Separator />

                    {/* Financial */}
                    {!financialData && !financialMutation.isPending && (
                      <div className="text-center py-2 space-y-3">
                        <TrendingUp className="h-7 w-7 text-primary/50 mx-auto" />
                        <p className="text-xs text-muted-foreground">Analiză financiară AI pentru acest imobil</p>
                        <Button className="w-full" onClick={() => financialMutation.mutate(propertyInfo)}>
                          <TrendingUp className="mr-2 h-4 w-4" /> Analiză Financiară
                        </Button>
                      </div>
                    )}

                    {financialMutation.isPending && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 text-primary animate-spin" />
                          <span className="text-xs text-muted-foreground">Calcul randament…</span>
                        </div>
                        {[1,2,3,4].map(i => <Skeleton key={i} className="h-3 w-full" />)}
                      </div>
                    )}

                    {financialData && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Analiză Financiară</p>
                        {financialData.grossYield != null && <MetricRow label="Randament brut" value={`${parseFloat(String(financialData.grossYield)).toFixed(2)}%`} highlight />}
                        {financialData.netYield != null && <MetricRow label="Randament net" value={`${parseFloat(String(financialData.netYield)).toFixed(2)}%`} highlight />}
                        {financialData.roi != null && <MetricRow label="ROI" value={`${parseFloat(String(financialData.roi)).toFixed(2)}%`} highlight />}
                        {financialData.pricePerSqm != null && <MetricRow label="Preț/m²" value={`€${parseFloat(String(financialData.pricePerSqm)).toLocaleString()}`} />}
                        {financialData.estimatedValue != null && <MetricRow label="Valoare estimată" value={`€${parseFloat(String(financialData.estimatedValue)).toLocaleString()}`} />}
                        {financialData.monthlyRent != null && <MetricRow label="Chirie lunară est." value={`€${parseFloat(String(financialData.monthlyRent)).toLocaleString()}`} />}
                        {financialData.opportunityScore != null && (
                          <div className="flex justify-center pt-1">
                            <ScoreBadge score={financialData.opportunityScore} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <Separator />
                    <div className="space-y-2 pb-2">
                      {/* Street View — embed intern */}
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => setStreetViewOpen(true)}
                        data-testid="open-street-view"
                      >
                        <Eye className="h-4 w-4" />
                        Street View 360°
                      </Button>
                      <Button variant="secondary" className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bookmark className="mr-2 h-4 w-4" />}
                        Salvează Proprietatea
                      </Button>
                      <Button
                        className="w-full font-semibold"
                        onClick={() => setPaymentModalOpen(true)}
                        data-testid="order-full-report"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Raport Complet — Nota Simplă
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
      />

      {/* Street View Modal — fullscreen iframe 360° */}
      <AnimatePresence>
        {streetViewOpen && (
          <motion.div
            key="sv-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-white">Street View 360°</span>
                {selectedCoords && (
                  <span className="text-xs text-white/50 font-mono ml-2">
                    {selectedCoords.lat.toFixed(5)}, {selectedCoords.lon.toFixed(5)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Open in Google Maps */}
                <a
                  href={streetViewUrl ?? ""}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors px-2 py-1"
                >
                  <Maximize2 className="h-3.5 w-3.5" /> Deschide complet
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStreetViewOpen(false)}
                  className="h-8 w-8 text-white hover:text-white hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* iframe Street View */}
            <div className="flex-1 relative">
              {streetViewEmbedUrl ? (
                <iframe
                  key={streetViewEmbedUrl}
                  src={streetViewEmbedUrl}
                  className="absolute inset-0 w-full h-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Street View"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-white/50">
                  <div className="text-center space-y-2">
                    <Eye className="h-10 w-10 mx-auto opacity-30" />
                    <p className="text-sm">Fă click pe o clădire mai întâi</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
